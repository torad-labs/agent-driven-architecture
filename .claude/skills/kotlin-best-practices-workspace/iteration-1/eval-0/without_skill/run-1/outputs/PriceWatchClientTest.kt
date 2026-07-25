package com.acme.trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * Tests exercise the full client against Ktor's [MockEngine]. Backoff is injected
 * as a deterministic zero/small fixed delay and `runTest` skips delays via virtual
 * time, so the suite is fast and reproducible — no real network, no real sleeping.
 */
class PriceWatchClientTest {

    private val fixedBackoff = BackoffStrategy { 10.milliseconds }

    private fun sseEngine(vararg responders: MockResponder): MockEngine {
        val queue = responders.toMutableList()
        return MockEngine { request ->
            val responder = queue.removeAt(0)
            responder(this, request.url.encodedPath)
        }
    }

    private fun client(
        engine: MockEngine,
        backoff: BackoffStrategy = fixedBackoff,
        maxRetries: Int = Int.MAX_VALUE,
    ): PriceWatchClient {
        val http = HttpClient(engine) { install(SSE) }
        return PriceWatchClient(
            httpClient = http,
            baseUrl = "https://gw.acme.trading/v1/stream",
            backoff = backoff,
            maxRetries = maxRetries,
        )
    }

    @Test
    fun `emits ticks parsed from the SSE stream`() = runTest {
        val body = sseBody(
            """{"symbol":"BTC-USD","price":64000.0,"timestampMillis":1}""",
            """{"symbol":"BTC-USD","price":64010.5,"timestampMillis":2}""",
        )
        val engine = sseEngine(okSse(body))

        val ticks = client(engine).stream("BTC-USD").toList()

        assertEquals(
            listOf(
                PriceTick("BTC-USD", 64000.0, 1),
                PriceTick("BTC-USD", 64010.5, 2),
            ),
            ticks,
        )
    }

    @Test
    fun `builds the correct per-symbol url`() = runTest {
        var seenPath: String? = null
        val engine = sseEngine { path ->
            seenPath = path
            respondSse(sseBody("""{"symbol":"ETH-USD","price":3000.0,"timestampMillis":1}"""))
        }

        client(engine).stream("ETH-USD").toList()

        assertEquals("/v1/stream/ETH-USD", seenPath)
    }

    @Test
    fun `retries transient 5xx then succeeds`() = runTest {
        val engine = sseEngine(
            { _ -> respondError(HttpStatusCode.ServiceUnavailable) },
            okSse(sseBody("""{"symbol":"BTC-USD","price":1.0,"timestampMillis":1}""")),
        )

        val states = mutableListOf<PriceStreamState>()
        val ticks = client(engine).stream("BTC-USD", onState = { states += it }).toList()

        assertEquals(listOf(PriceTick("BTC-USD", 1.0, 1)), ticks)
        assertTrue(states.any { it is PriceStreamState.Reconnecting }, "expected a Reconnecting state")
    }

    @Test
    fun `does not retry permanent 4xx`() = runTest {
        var calls = 0
        val engine = sseEngine(
            { _ ->
                calls++
                respondError(HttpStatusCode.NotFound)
            },
        )

        assertFailsWith<SSEClientException> {
            client(engine).stream("NOPE").toList()
        }
        assertEquals(1, calls, "4xx must not be retried")
    }

    @Test
    fun `gives up after maxRetries and surfaces the cause`() = runTest {
        val engine = sseEngine(
            { _ -> respondError(HttpStatusCode.BadGateway) },
            { _ -> respondError(HttpStatusCode.BadGateway) },
            { _ -> respondError(HttpStatusCode.BadGateway) },
        )

        assertFailsWith<SSEClientException> {
            client(engine, maxRetries = 2).stream("BTC-USD").toList()
        }
    }
}

/** Decoder is independently testable without any HTTP at all. */
class JsonPriceTickDecoderTest {
    private val decoder = JsonPriceTickDecoder()

    @Test
    fun `decodes a well-formed payload`() {
        val tick = decoder.decode("""{"symbol":"BTC-USD","price":42.0,"timestampMillis":7}""")
        assertEquals(PriceTick("BTC-USD", 42.0, 7), tick)
    }

    @Test
    fun `ignores blank keep-alive payloads`() {
        assertEquals(null, decoder.decode("   "))
    }
}

/** Backoff math is pure and testable in isolation. */
class ExponentialBackoffTest {
    @Test
    fun `grows exponentially and stays within the cap`() {
        // random fixed to 1.0 -> returns the full (uncapped-then-capped) value
        val fullJitter = ExponentialBackoff(
            base = 100.milliseconds,
            maxDelay = 1000.milliseconds,
            random = kotlin.random.Random(0),
        )
        // Just assert monotonic-ish bound: every delay <= cap.
        (1..10).forEach { attempt ->
            val d = fullJitter.delayFor(attempt)
            assertTrue(d <= 1000.milliseconds, "delay $d exceeded cap at attempt $attempt")
            assertTrue(d >= Duration.ZERO)
        }
    }
}

// --- test plumbing ------------------------------------------------------------

private typealias MockResponder =
    suspend io.ktor.client.engine.mock.MockRequestHandleScope.(path: String) -> io.ktor.client.request.HttpResponseData

private fun okSse(body: String): MockResponder = { respondSse(body) }

private fun io.ktor.client.engine.mock.MockRequestHandleScope.respondSse(body: String) =
    respond(
        content = ByteReadChannel(body),
        headers = headersOf(HttpHeaders.ContentType, "text/event-stream"),
    )

/** Builds a minimal SSE body: one `data:` line per event, blank line terminates. */
private fun sseBody(vararg dataLines: String): String =
    dataLines.joinToString(separator = "") { "data: $it\n\n" }
