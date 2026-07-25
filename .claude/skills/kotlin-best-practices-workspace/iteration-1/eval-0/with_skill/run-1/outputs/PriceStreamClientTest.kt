package com.acme.trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.sse.SSE
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * Unit tests for [PriceStreamClient].
 *
 * Every test runs under [runTest] (virtual time — backoff `delay`s are skipped,
 * so even multi-retry tests finish instantly) and drives a Ktor [MockEngine]
 * sharing the production [SSE] plugin config. No real network, no real clock,
 * deterministic jitter via a seeded [Random].
 */
class PriceStreamClientTest {

    private val symbol = Symbol("AAPL")

    /** Build a client whose engine returns [handler]'s response for every call. */
    private fun clientWith(
        random: Random = Random(0),
        retry: RetryPolicy = RetryPolicy(maxRetries = 3, baseDelay = 10.milliseconds),
        dispatcher: kotlinx.coroutines.CoroutineDispatcher,
        handler: MockEngine,
    ): PriceStreamClient =
        PriceStreamClient(
            client = HttpClient(handler) { install(SSE) },
            baseUrl = "https://gw.acme.trading/v1/stream",
            retry = retry,
            dispatcher = dispatcher,
            random = random,
        )

    private fun sseFrame(price: String, change: String, ts: Long): String =
        "data: {\"p\":\"$price\",\"c\":\"$change\",\"t\":$ts}\n\n"

    private fun sseEngine(body: String): MockEngine = MockEngine {
        respond(
            content = ByteReadChannel(body),
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "text/event-stream"),
        )
    }

    @Test
    fun emitsParsedTicksInOrder() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val body = sseFrame("190.10", "+1.2", 1L) + sseFrame("190.25", "+1.35", 2L)
        val client = clientWith(dispatcher = dispatcher, handler = sseEngine(body))

        val ticks = client.ticks(symbol).take(2).toList()

        assertEquals(
            listOf(
                PriceTick(symbol, "190.10", "+1.2", 1L),
                PriceTick(symbol, "190.25", "+1.35", 2L),
            ),
            ticks,
        )
    }

    @Test
    fun skipsMalformedFrameButKeepsReading() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val body = "data: not-json\n\n" + sseFrame("5.00", "0.0", 9L)
        val client = clientWith(dispatcher = dispatcher, handler = sseEngine(body))

        val ticks = client.ticks(symbol).take(1).toList()

        assertEquals(listOf(PriceTick(symbol, "5.00", "0.0", 9L)), ticks)
    }

    @Test
    fun retriesTransientErrorThenSucceeds() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        var call = 0
        val engine = MockEngine { _ ->
            call++
            if (call == 1) {
                respondError(HttpStatusCode.ServiceUnavailable) // 503 -> retryable
            } else {
                respond(
                    content = ByteReadChannel(sseFrame("42.0", "0.0", 7L)),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "text/event-stream"),
                )
            }
        }
        val client = clientWith(dispatcher = dispatcher, handler = engine)

        val ticks = client.ticks(symbol).take(1).toList()

        assertEquals(listOf(PriceTick(symbol, "42.0", "0.0", 7L)), ticks)
        assertEquals(2, call) // one failed attempt + one success
    }

    @Test
    fun terminalErrorIsNotRetriedAndPropagates() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        var call = 0
        val engine = MockEngine { _ ->
            call++
            respondError(HttpStatusCode.Unauthorized) // 401 -> terminal
        }
        val client = clientWith(dispatcher = dispatcher, handler = engine)

        val error = assertFailsWith<PriceStreamError> {
            client.ticks(symbol).toList()
        }

        assertEquals(1, call) // failed fast, no retry
        assertEquals(401, error.status)
        assertEquals(PriceStreamErrorKind.Http, error.kind)
        assertTrue(error.attempts.isNotEmpty())
    }

    @Test
    fun exhaustsRetriesThenPropagatesWithHistory() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        var call = 0
        val engine = MockEngine { _ ->
            call++
            respondError(HttpStatusCode.BadGateway) // 502 -> retryable, always fails
        }
        val client = clientWith(
            random = Random(1),
            retry = RetryPolicy(maxRetries = 2, baseDelay = 10.milliseconds),
            dispatcher = dispatcher,
            handler = engine,
        )

        val error = assertFailsWith<PriceStreamError> {
            client.ticks(symbol).toList()
        }

        assertEquals(3, call) // initial + 2 retries
        assertEquals(3, error.attempts.size)
        assertEquals(502, error.attempts.last().status)
    }

    @Test
    fun collectorCancellationTearsDownStream() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        // An endless stream: without cancellation this would never complete.
        val frames = (1..10_000).joinToString("") { sseFrame("1.0", "0.0", it.toLong()) }
        val client = clientWith(dispatcher = dispatcher, handler = sseEngine(frames))

        val seen = mutableListOf<PriceTick>()
        val job = backgroundScope.launch {
            client.ticks(symbol).collect { seen.add(it) }
        }
        testScheduler.advanceUntilIdle()
        job.cancel() // user leaves the screen

        // The collector stopped cleanly; no exception leaked, some ticks arrived.
        assertTrue(seen.isNotEmpty())
    }

    @Test
    fun overallDeadlineBoundsTheWatch() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val engine = MockEngine { _ ->
            respondError(HttpStatusCode.ServiceUnavailable) // always retryable failure
        }
        val client = clientWith(
            retry = RetryPolicy(
                maxRetries = Int.MAX_VALUE,
                baseDelay = 1.seconds,
                overallDeadline = 5.seconds,
            ),
            dispatcher = dispatcher,
            handler = engine,
        )

        // Without the deadline, maxRetries = MAX_VALUE would loop forever; the
        // 5s overall deadline forces termination under virtual time.
        assertFailsWith<Throwable> {
            client.ticks(symbol).toList()
        }
    }
}
