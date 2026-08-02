package com.acme.trading.pricewatch

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

/**
 * Example UI binding. Shows the intended consumption pattern:
 *
 * - Collection happens in a lifecycle-scoped [scope] (on Android, this is
 *   `viewModelScope`). When the user leaves the screen the ViewModel is cleared,
 *   the scope is cancelled, and the cold [PriceWatchClient.stream] flow tears the
 *   SSE connection down for you. Nothing to remember to close.
 * - The latest tick and the connection state are exposed as [StateFlow]s for the
 *   UI to render.
 */
public class PriceWatchViewModel(
    private val client: PriceWatchClient,
    private val scope: CoroutineScope,
) {
    private val _tick = MutableStateFlow<PriceTick?>(null)
    public val tick: StateFlow<PriceTick?> = _tick.asStateFlow()

    private val _state = MutableStateFlow<PriceStreamState>(PriceStreamState.Connecting)
    public val state: StateFlow<PriceStreamState> = _state.asStateFlow()

    private val _error = MutableStateFlow<Throwable?>(null)
    public val error: StateFlow<Throwable?> = _error.asStateFlow()

    public fun watch(symbol: String) {
        client.stream(symbol, onState = { _state.value = it })
            .onEach { _tick.value = it }
            .catch { cause -> _error.value = cause } // terminal, non-transient failure
            .launchIn(scope)
    }
}
