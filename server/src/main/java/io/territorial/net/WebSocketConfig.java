package io.territorial.net;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final GameHandler handler;
    // Default "*" for dev; in production set TERRITORIAL_WS_ALLOWED_ORIGINS=https://your-domain.
    @Value("${territorial.ws.allowed-origins:*}")
    private String allowedOrigins;

    public WebSocketConfig(GameHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/game").setAllowedOrigins(allowedOrigins.split(","));
    }

    /** Cap inbound frame size and idle time so one socket can't exhaust memory or linger forever. */
    @Bean
    public ServletServerContainerFactoryBean wsContainer() {
        ServletServerContainerFactoryBean c = new ServletServerContainerFactoryBean();
        c.setMaxTextMessageBufferSize(8 * 1024);
        c.setMaxBinaryMessageBufferSize(8 * 1024);
        c.setMaxSessionIdleTimeout(120_000L);
        return c;
    }
}
