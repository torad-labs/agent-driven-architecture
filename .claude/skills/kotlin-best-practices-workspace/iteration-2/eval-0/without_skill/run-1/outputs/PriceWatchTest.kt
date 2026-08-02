package com.acme.pricewatch

import app.cash.turbine.test
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.writeStringUtf8
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PriceWatchParsingTest {

    @Test
    fun parses_a_well_formed_price_line() {
        assertEquals(PriceTick("BTCUSD", 42.5), parsePriceLine("BTCUSD", "price:42.5"))
    }

    @Test
    fun tolerates_surrounding_whitespace() {
        assertEquals(PriceTick("BTCUSD", 7.0), parsePriceLine("BTCUSD", "  price: 7  "))
    }

    @Test
    fun skips_blank_lines_and_keepalives() {
        assertNull(parsePriceLine("BTCUSD", ""))
        assertNull(parsePriceLine("BTCUSD", "   "))
        assertNull(parsePriceLine("BTCUSD", ": keep-alive"))
        assertNull(parsePriceLine("BTCUSD", "heartbeat"))
    }

    @Test
    fun skips_malformed_numbers_without_throwing() {
        assertNull(parsePriceLine("BTCUSD", "price:not-a-number"))
        assertNull(parsePriceLine("BTCUSD", "price:"))
    }

    @Test
    fun cancellation_is_never_transient() {
        // Guards the retry classifier: a screen-exit must NOT be retried.
        assertTrue(!isTransient(kotlinx.coroutines.CancellationException("left screen")))
    }

    @Test
    fun http_errors_are_terminal_network_errors_are_transient() {
        assertTrue(!isTransient(PriceStreamHttpException(404, "nope")))
        assertTrue(isTransient(RuntimeException("connection reset")))
    }
}

class PriceWatchClientTest {

    private fun clientReturning(channel: ByteReadChannel): HttpClient {
        val engine = MockEngine { _ ->
            respond(
                content = channel,
                status = HttpStatusCode.OK,
                headers = headersOf("Content-Type", "text/plain"),
            )
        }
        return HttpClient(engine)
    }

    @Test
    fun emits_ticks_as_lines_arrive() = runTest {
        // A finite NDJSON body that ends — verifies framing + parsing end-to-end.
        val body = ByteReadChannel(
            buildString {
                append("price:1.0\n")
                append("\n")              // blank — ignored
                append("heartbeat\n")     // keep-alive — ignored
                append("price:2.5\n")
                append("price:bad\n")     // malformed — ignored
                append("price:3.0\n")
            },
        )
        val client = clientReturning(body)
        val watcher = PriceWatchClient(client, baseUrl = "https://gw.acme.trading")

        val ticks = watcher.stream("BTCUSD").take(3).toList()

        assertEquals(
            listOf(
                PriceTick("BTCUSD", 1.0),
                PriceTick("BTCUSD", 2.5),
                PriceTick("BTCUSD", 3.0),
            ),
            ticks,
        )
        client.close()
    }

    @Test
    fun streams_incrementally_from_a_live_never_closing_channel() = runTest {
        // Simulates the real gateway: a channel we write to over time and never
        // close. The collector should receive each tick as it is written, and
        // tearing down the flow (take + cancel) must not hang.
        val live = ByteChannel(autoFlush = true)
        val client = clientReturning(live)
        val watcher = PriceWatchClient(client, baseUrl = "https://gw.acme.trading")

        watcher.stream("ETHUSD").test {
            live.writeStringUtf8("price:10.0\n")
            assertEquals(PriceTick("ETHUSD", 10.0), awaitItem())

            live.writeStringUtf8("price:11.0\n")
            assertEquals(PriceTick("ETHUSD", 11.0), awaitItem())

            // Leave the screen: cancelling the collector aborts the request even
            // though the channel is still open (clean shutdown, no leak/hang).
            cancelAndIgnoreRemainingEvents()
        }
        client.close()
    }

    @Test
    fun retries_on_a_transient_drop_then_resumes() = runTest {
        // First connection drops after one tick; second connection delivers more.
        // Backoff delays are virtual-time-skipped by runTest.
        var attempt = 0
        val engine = MockEngine { _ ->
            attempt += 1
            when (attempt) {
                1 -> respond(
                    content = ByteReadChannel("price:1.0\n"), // ends cleanly == drop
                    status = HttpStatusCode.OK,
                )
                else -> respond(
                    content = ByteReadChannel("price:2.0\nprice:3.0\n"),
                    status = HttpStatusCode.OK,
                )
            }
        }
        val client = HttpClient(engine)
        val watcher = PriceWatchClient(
            client,
            baseUrl = "https://gw.acme.trading",
            reconnect = ReconnectPolicy(maxRetries = 3, baseDelayMs = 1L, maxDelayMs = 1L),
        )

        val ticks = watcher.stream("BTCUSD").take(3).toList()

        assertEquals(
            listOf(
                PriceTick("BTCUSD", 1.0),
                PriceTick("BTCUSD", 2.0),
                PriceTick("BTCUSD", 3.0),
            ),
            ticks,
        )
        assertTrue(attempt >= 2, "expected at least one reconnect, got $attempt attempts")
        client.close()
    }

    @Test
    fun gives_up_after_max_consecutive_transient_failures() = runTest {
        // Every connection is accepted but closed with no data -> each counts as
        // a transient failure against the budget. After maxRetries consecutive
        // failures the flow stops reconnecting and surfaces the failure instead
        // of looping forever. This is the guard against a reconnect storm.
        var attempt = 0
        val engine = MockEngine { _ ->
            attempt += 1
            respond(content = ByteReadChannel(""), status = HttpStatusCode.OK) // empty -> immediate close
        }
        val client = HttpClient(engine)
        val watcher = PriceWatchClient(
            client,
            reconnect = ReconnectPolicy(maxRetries = 2, baseDelayMs = 1L, maxDelayMs = 1L),
        )

        assertFailsWith<EmptyStreamException> {
            watcher.stream("BTCUSD").toList()
        }
        // 1 initial attempt + maxRetries (2) reconnects = 3 connections.
        assertEquals(3, attempt)
        client.close()
    }

    @Test
    fun http_error_status_is_terminal_and_not_retried() = runTest {
        var attempt = 0
        val engine = MockEngine { _ ->
            attempt += 1
            respondError(HttpStatusCode.Unauthorized, "bad token")
        }
        val client = HttpClient(engine)
        val watcher = PriceWatchClient(client, reconnect = ReconnectPolicy(maxRetries = 5))

        val error = assertFailsWith<PriceStreamHttpException> {
            watcher.stream("BTCUSD").toList()
        }
        assertEquals(401, error.status)
        assertEquals(1, attempt, "a 4xx must not be retried")
        client.close()
    }
}
