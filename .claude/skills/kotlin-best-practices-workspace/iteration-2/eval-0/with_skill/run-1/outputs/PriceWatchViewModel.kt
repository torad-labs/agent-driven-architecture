package trading.pricewatch

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch

/** What the price-watch screen renders. A finite outcome space → `sealed`. */
public sealed interface PriceWatchUiState {
    public data object Loading : PriceWatchUiState
    public data class Streaming(val symbol: Symbol, val price: Double) : PriceWatchUiState
    public data class Failed(val symbol: Symbol, val reason: String) : PriceWatchUiState
}

/**
 * Screen-scoped holder that drives [PriceWatchGateway.priceTicks] into an
 * immutable [StateFlow] the UI observes (Tier 0 / Coroutines §12: expose
 * immutable state backed by a private `Mutable*`).
 *
 * Lifecycle (Tier 0 / Coroutines §13, Security §4): the work runs in an injected
 * [scope] whose [SupervisorJob] is owned here. There is **no** `GlobalScope`.
 * When the user leaves the screen the host calls [close], cancelling the scope;
 * that cancellation unwinds the collector, the suspended channel read, and the
 * in-flight GET — a clean shutdown with no leaked connection. [close] is
 * idempotent so `use {}`-style call sites are safe.
 *
 * In an Android `ViewModel` you would hand `viewModelScope` here and call
 * [close] from `onCleared()`; in tests you hand a `TestScope`.
 */
public class PriceWatchViewModel(
    private val gateway: PriceWatchGateway,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob()),
) : AutoCloseable {

    private val _state = MutableStateFlow<PriceWatchUiState>(PriceWatchUiState.Loading)
    public val state: StateFlow<PriceWatchUiState> = _state.asStateFlow()

    private var closed = false

    /** Begin streaming [symbol]. Each tick updates [state] as it arrives. */
    public fun watch(symbol: Symbol) {
        scope.launch {
            gateway.priceTicks(symbol)
                .onStart { _state.value = PriceWatchUiState.Loading }
                .catch { e ->
                    // The flow already rethrew CancellationException internally, so
                    // a throwable reaching here is a real, exhausted failure — surface
                    // it as typed UI state, never a fake/last-known price (Errors §9).
                    _state.value = PriceWatchUiState.Failed(symbol, e.message ?: "stream failed")
                }
                .collect { tick -> _state.value = PriceWatchUiState.Streaming(symbol, tick.price) }
        }
    }

    /** Idempotent (Tier 0 / Security §4). Safe to call from `onCleared()` twice. */
    override fun close() {
        if (closed) return
        closed = true
        scope.cancel()
    }
}
