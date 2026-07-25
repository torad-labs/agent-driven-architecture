package com.acme.notes.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Internal to the Notes Android app. Backs the Settings screen.
// Not part of any published library — nothing outside this app module uses it.
internal class SettingsViewModel(
    private val prefs: SettingsRepository,
) : ViewModel() {

    data class SettingsUiState(
        val darkMode: Boolean = false,
        val fontScale: Float = 1.0f,
        val syncEnabled: Boolean = true,
    )

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val saved = withContext(Dispatchers.IO) { prefs.read() }
            _state.value = SettingsUiState(
                darkMode = saved.darkMode,
                fontScale = saved.fontScale,
                syncEnabled = saved.syncEnabled,
            )
        }
    }

    fun setDarkMode(enabled: Boolean) {
        _state.value = _state.value.copy(darkMode = enabled)
        persist()
    }

    fun setFontScale(scale: Float) {
        _state.value = _state.value.copy(fontScale = scale.coerceIn(0.8f, 2.0f))
        persist()
    }

    private fun persist() {
        val snapshot = _state.value
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                prefs.write(snapshot.darkMode, snapshot.fontScale, snapshot.syncEnabled)
            }
        }
    }
}
