package io.territorial.net;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the exported web client (client/dist) from the SAME origin/port as the game. This means
 * players only need one port — and the game WebSocket (ws://host:8080/ws/game) is same-origin as
 * the page, so whatever reaches the page reaches the socket. /api and /ws/game take precedence
 * over this catch-all static handler.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    // Default points at the Expo web export, relative to the server's working dir (server/).
    @Value("${territorial.webDir:file:../client/dist/}")
    private String webDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**").addResourceLocations(webDir);
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
    }
}
