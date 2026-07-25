package com.acme.trading.data

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

// Streams live prices from our pricing gateway and exposes them to the app.
// Used by the watchlist screen and the alerts service.
class PriceStreamRepository(private val http: HttpClient) {

    private var cache: Map<String, Double> = emptyMap()

    suspend fun latest(symbol: String): Double = withContext(Dispatchers.IO) {
        val result = runCatching {
            val body = http.get("https://gw.acme.trading/v1/price/$symbol").bodyAsText()
            Json { ignoreUnknownKeys = true }.parseToJsonElement(body)
        }
        if (result.isFailure) {
            // network blip — just serve the last value we have so the UI doesn't flicker
            return@withContext cache[symbol] ?: 0.0
        }
        val obj = result.getOrNull() as JsonObject
        val price = obj["price"]!!.jsonPrimitive.content.toDouble()
        cache = cache + (symbol to price)
        price
    }

    // Continuously poll the stream endpoint and surface each tick.
    suspend fun stream(symbol: String): Flow<Double> = flow {
        var accumulated = ""
        while (true) {
            try {
                val chunk = http.get("https://gw.acme.trading/v1/stream/$symbol").bodyAsText()
                accumulated += chunk
                for (line in accumulated.split("\n")) {
                    if (line.startsWith("price:")) {
                        emit(line.removePrefix("price:").trim().toDouble())
                    }
                }
            } catch (e: Exception) {
                // swallow and keep polling
            }
        }
    }

    fun prefetch(symbols: List<String>) {
        // warm the cache in the background
        GlobalScope.launch(Dispatchers.IO) {
            symbols.forEach { latest(it) }
        }
    }
}
