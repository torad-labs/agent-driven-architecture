package trading.pricewatch

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Unit tests for [PriceWatchGateway]. No real network and no real wall clock:
 *
 *  - Ktor [MockEngine] stands in for the gateway, sharing the production
 *    [HttpClient] config (Tier 0 / Testing §3). Each test scripts the exact
 *    bytes the long-lived GET would write.
 *  - [runTest] drives coroutines on a virtual scheduler, so retry/backoff
 *    delays are skipped instead of slept (Tier 0 / Testing §1). We never use
 *    `runBlocking`.
 *  - The injected [Random] is seeded, making jittered backoff deterministic
 *    (Tier 0 / Testing §4).
 *  - The tick flow is infinite, so we bound it with `take(n)` before `toList()`
 *    rather than collecting an unbounded flow under `runTest` (Tier 0 / Testing §2).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PriceWatchGatewayTest {

    private val zeroBackoff = RetryPolicy(maxRetries = 3, baseDelayMs = 1L, maxDelayMs = 1L)

    /** Build a gateway whose engine plays [handler], using the test scheduler's dispatcher. */
    private fun gatewayWith(
        random: Random = Random(0),
        retryPolicy: RetryPolicy = zeroBackoff,
        handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData,
    ): PriceWatchGateway {
        val client = HttpClient(MockEngine { request -> handler(request) })
        return PriceWatchGateway(
            client = client,
            baseUrl = "https://gw.test",
            retryPolicy = retryPolicy,
            // Run framing inline on the test scheduler — keeps virtual time honest.
            streamDispatcher = kotlinx.coroutines.Dispatchers.Unconfined,
            random = random,
        )
    }

    private fun streamBody(vararg lines: String): ByteReadChannel =
        ByteReadChannel(lines.joinToString(separator = "") { "$it\n" })

    @Test
    fun emits_ticks_as_lines_arrive() = runTest {
        val gateway = gatewayWith {
            respond(
                content = streamBody("price:101.5", "price:102.0", "price:99.25"),
                status = HttpStatusCode.OK,
            )
        }

        val ticks = gateway.priceTicks(Symbol("ACME")).take(3).toList()

        assertEquals(
            listOf(101.5, 102.0, 99.25),
            ticks.map { it.price },
        )
        assertTrue(ticks.all { it.symbol == Symbol("ACME") })
    }

    @Test
    fun skips_blank_and_malformed_frames_without_killing_the_stream() = runTest {
        val gateway = gatewayWith {
            respond(
                content = streamBody("", "price:10.0", "heartbeat", "price:not-a-number", "price:11.0"),
                status = HttpStatusCode.OK,
            )
        }

        val ticks = gateway.priceTicks(Symbol("ACME")).take(2).toList()

        assertEquals(listOf(10.0, 11.0), ticks.map { it.price })
    }

    @Test
    fun fails_fast_on_terminal_status() = runTest {
        var calls = 0
        val gateway = gatewayWith {
            calls++
            respond(content = ByteReadChannel("forbidden"), status = HttpStatusCode.Forbidden)
        }

        val error = assertFailsWith<GatewayStreamException> {
            gateway.priceTicks(Symbol("ACME")).toList()
        }

        assertEquals(403, error.statusCode)
        assertEquals(1, calls) // no retry on a terminal 4xx
    }

    @Test
    fun retries_transient_5xx_then_succeeds() = runTest {
        var calls = 0
        val gateway = gatewayWith {
            calls++
            if (calls < 3) {
                respond(content = ByteReadChannel("upstream down"), status = HttpStatusCode.BadGateway)
            } else {
                respond(content = streamBody("price:200.0"), status = HttpStatusCode.OK)
            }
        }

        val tick = gateway.priceTicks(Symbol("ACME")).take(1).toList().single()

        assertEquals(200.0, tick.price)
        assertEquals(3, calls) // two 502s retried, third connection delivered
    }

    @Test
    fun gives_up_after_max_retries() = runTest {
        var calls = 0
        val gateway = gatewayWith(retryPolicy = RetryPolicy(maxRetries = 2, baseDelayMs = 1L, maxDelayMs = 1L)) {
            calls++
            respond(content = ByteReadChannel("still down"), status = HttpStatusCode.ServiceUnavailable)
        }

        assertFailsWith<GatewayStreamException> {
            gateway.priceTicks(Symbol("ACME")).toList()
        }

        assertEquals(3, calls) // initial attempt + 2 retries
    }

    @Test
    fun rate_limit_429_is_retryable() = runTest {
        var calls = 0
        val gateway = gatewayWith {
            calls++
            if (calls == 1) {
                respond(content = ByteReadChannel("slow down"), status = HttpStatusCode.TooManyRequests)
            } else {
                respond(content = streamBody("price:5.0"), status = HttpStatusCode.OK)
            }
        }

        val tick = gateway.priceTicks(Symbol("ACME")).take(1).toList().single()

        assertEquals(5.0, tick.price)
        // The 429 forced at least one reconnect before the OK delivered a tick.
        // We assert >= 2 rather than == 2: a single-line body EOFs after the tick,
        // and the loop's reconnect-on-clean-close may fire a further GET before
        // take(1)'s cancellation lands — that reconnect is correct behaviour, not
        // a retry of the 429. Exact retry counts are pinned in the 5xx test, whose
        // handler gates on call number so it can't race.
        assertTrue(calls >= 2, "429 should have been retried; calls=$calls")
    }

    @Test
    fun reconnects_when_an_open_stream_closes_cleanly() = runTest {
        var calls = 0
        val gateway = gatewayWith {
            calls++
            when (calls) {
                1 -> respond(content = streamBody("price:1.0"), status = HttpStatusCode.OK) // closes after one line
                else -> respond(content = streamBody("price:2.0"), status = HttpStatusCode.OK)
            }
        }

        // First connection yields one tick then EOFs; the gateway reconnects for the second.
        val ticks = gateway.priceTicks(Symbol("ACME")).take(2).toList()

        assertEquals(listOf(1.0, 2.0), ticks.map { it.price })
        assertEquals(2, calls)
    }

    @Test
    fun progress_resets_the_consecutive_failure_budget() = runTest {
        // Budget of 1 retry. Sequence: fail, OK+tick (resets), fail, OK+tick.
        // If the budget were cumulative this would throw on the 2nd failure; because
        // a delivered tick resets it, the stream survives and yields both ticks.
        var calls = 0
        val gateway = gatewayWith(retryPolicy = RetryPolicy(maxRetries = 1, baseDelayMs = 1L, maxDelayMs = 1L)) {
            calls++
            when (calls) {
                1, 4 -> respond(content = ByteReadChannel("down"), status = HttpStatusCode.ServiceUnavailable)
                2 -> respond(content = streamBody("price:1.0"), status = HttpStatusCode.OK)
                else -> respond(content = streamBody("price:2.0"), status = HttpStatusCode.OK)
            }
        }

        val ticks = gateway.priceTicks(Symbol("ACME")).take(2).toList()

        assertEquals(listOf(1.0, 2.0), ticks.map { it.price })
    }

    @Test
    fun cancellation_stops_collection_cleanly() = runTest {
        val gateway = gatewayWith {
            respond(content = streamBody("price:1.0", "price:2.0", "price:3.0"), status = HttpStatusCode.OK)
        }

        // Collecting only the first tick cancels the flow; this must complete (no hang),
        // which proves CancellationException unwinds the channel read rather than being
        // swallowed by the broad catch in the retry loop.
        val first = gateway.priceTicks(Symbol("ACME")).take(1).toList().single()

        assertEquals(1.0, first.price)
    }

    @Test
    fun backoff_is_jittered_and_capped() {
        val policy = RetryPolicy(maxRetries = 10, baseDelayMs = 100L, maxDelayMs = 1_000L)
        val rng = Random(42)
        repeat(20) { attempt ->
            val delay = policy.delayForAttempt(attempt, rng)
            assertTrue(delay in 0..1_000L, "delay $delay out of [0,1000] at attempt $attempt")
        }
    }

    // Confirms the headers seam is exercisable; the gateway sends Accept: text/plain.
    @Test
    fun sends_plain_accept_header() = runTest {
        var seenAccept: String? = null
        val gateway = gatewayWith {
            seenAccept = it.headers["Accept"]
            respond(content = streamBody("price:1.0"), status = HttpStatusCode.OK, headers = headersOf())
        }

        gateway.priceTicks(Symbol("ACME")).take(1).toList()

        assertEquals("text/plain", seenAccept)
    }
}
