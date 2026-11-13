package com.paynet.server;

import com.paynet.common.Protocol;
import com.paynet.server.service.PaymentService;
import com.paynet.server.service.PaymentServiceImpl;
import com.paynet.web.WebServer;
import java.nio.file.Path;
import java.nio.file.Paths;

/** Starts everything: payment engine + TCP server (port 5000) + web server (port 8080). */
public class ServerMain {
    public static void main(String[] args) throws Exception {
        Path dataDir = Paths.get(args.length > 0 ? args[0] : "data");
        Path webRoot = Paths.get(args.length > 1 ? args[1] : "web");
        PaymentService service = new PaymentServiceImpl(dataDir);
        new TcpServer(service, Protocol.TCP_PORT).start();
        new WebServer(service, Protocol.HTTP_PORT, webRoot).start();
        System.out.println("PayNet running. TCP " + Protocol.TCP_PORT + " | Website http://localhost:" + Protocol.HTTP_PORT);
    }
}
