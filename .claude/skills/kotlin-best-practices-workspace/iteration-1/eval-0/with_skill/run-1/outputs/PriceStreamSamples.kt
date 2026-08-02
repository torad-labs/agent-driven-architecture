package com.acme.trading.pricewatch.samples

import com.acme.trading.pricewatch.PriceStreamClient
import com.acme.trading.pricewatch.PriceStreamError
import com.acme.trading.pricewatch.Symbol
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

/**
 * How a screen consumes the stream. Collecting inside the screen's own scope
 * (here a generic [CoroutineScope] standing in for `viewModelScope`) means the
 * SSE connection is opened on first collect and torn down automatically when
 * that scope is cancelled — i.e. when the user leaves the screen. The screen
 * never calls a `stop()`/`close()`; cancellation is the teardown.
 */
public fun collectPriceTicks(
    scope: CoroutineScope,
    client: PriceStreamClient,
    onPrice: (price: String) -> Unit,
    onStreamFailed: (PriceStreamError) -> Unit,
): Job =
    scope.launch {
        client.ticks(Symbol("AAPL"))
            // Stream errors are surfaced as a typed PriceStreamError once retries
            // are exhausted; show a banner rather than a stale price.
            .catch { e -> (e as? PriceStreamError)?.let(onStreamFailed) ?: throw e }
            .collect { tick -> onPrice(tick.price) }
    }
