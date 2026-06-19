package io.territorial.net;

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

    public WebSocketConfig(GameHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // setAllowedOrigins("*") so the Expo web/dev client can connect during development.
        registry.addHandler(handler, "/ws/game").setAllowedOrigins("*");
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
