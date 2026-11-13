package com.paynet.client;

import com.paynet.common.Money;
import com.paynet.common.Protocol;
import com.paynet.common.Transaction;

import java.util.List;
import java.util.Scanner;

/**
 * Simple command-line client for demos.
 * Usage: java com.paynet.client.ConsoleClient [host] [port]
 * Commands: register, login, balance, deposit 10.50, send bob 5.00 note, history, quit
 */
public class ConsoleClient {

    private static String me = null; // name of the logged-in user (null = not logged in)

    public static void main(String[] args) {
        String host = args.length > 0 ? args[0] : "localhost";
        int port = args.length > 1 ? Integer.parseInt(args[1]) : Protocol.TCP_PORT;

        NetClient client = new NetClient();
        // Pushed events are printed as soon as they arrive (from the reader thread).
        client.setListener(new NetClient.EventListener() {
            @Override public void onTransaction(Transaction t) {
                System.out.println("\n>>> EVENT: " + describe(t));
                System.out.print("> ");
            }
            @Override public void onDisconnected() {
                System.out.println("\n*** Disconnected from server.");
                System.exit(0);
            }
        });

        try {
            client.connect(host, port);
        } catch (ClientException e) {
            System.out.println("Error: " + e.getMessage());
            return;
        }
        System.out.println("Connected to " + host + ":" + port);
        System.out.println("Commands: register | login | balance | deposit <amt> | send <user> <amt> [note] | history | quit");

        Scanner sc = new Scanner(System.in);
        while (true) {
            System.out.print("> ");
            if (!sc.hasNextLine()) break;
            String line = sc.nextLine().trim();
            if (line.isEmpty()) continue;
            String[] w = line.split("\\s+", 4);
            String cmd = w[0].toLowerCase();
            try {
                switch (cmd) {
                    case "register": {
                        System.out.print("Username: "); String u = sc.nextLine().trim();
                        System.out.print("Password: "); String p = sc.nextLine().trim();
                        System.out.print("Full name: "); String n = sc.nextLine().trim();
                        client.register(u, p, n);
                        System.out.println("Registered. Now use: login");
                        break;
                    }
                    case "login": {
                        System.out.print("Username: "); String u = sc.nextLine().trim();
                        System.out.print("Password: "); String p = sc.nextLine().trim();
                        long bal = client.login(u, p);
                        me = u;
                        System.out.println("Logged in as " + u + ". Balance: " + Money.format(bal));
                        break;
                    }
                    case "balance":
                        System.out.println("Balance: " + Money.format(client.balance()));
                        break;
                    case "deposit":
                        need(w.length >= 2, "deposit <amount>");
                        System.out.println("New balance: " + Money.format(client.deposit(Money.parse(w[1]))));
                        break;
                    case "send":
                        need(w.length >= 3, "send <user> <amount> [note]");
                        String note = w.length > 3 ? w[3] : "";
                        System.out.println("Sent. New balance: "
                                + Money.format(client.transfer(w[1], Money.parse(w[2]), note)));
                        break;
                    case "history":
                        List<Transaction> list = client.history(20);
                        for (Transaction t : list) System.out.println("  " + describe(t));
                        if (list.isEmpty()) System.out.println("  (no transactions)");
                        break;
                    case "quit":
                    case "exit":
                        client.logout();
                        System.out.println("Bye.");
                        return;
                    default:
                        System.out.println("Unknown command.");
                }
            } catch (ClientException e) {
                System.out.println("Error [" + e.getCode() + "]: " + e.getMessage());
            } catch (IllegalArgumentException | ArithmeticException e) {
                // NumberFormatException (bad amount) is an IllegalArgumentException
                System.out.println("Invalid input: " + e.getMessage());
            }
        }
        client.close();
    }

    private static void need(boolean ok, String usage) {
        if (!ok) throw new IllegalArgumentException("usage: " + usage);
    }

    /** Human readable line for one transaction. */
    private static String describe(Transaction t) {
        String text;
        if (me != null && t.getTo().equals(me) && !t.getFrom().equals(me)) {
            text = "received " + Money.format(t.getCents()) + " from " + t.getFrom();
        } else if (me != null && t.getFrom().equals(me) && !t.getTo().equals(me)) {
            text = "sent " + Money.format(t.getCents()) + " to " + t.getTo();
        } else {
            text = t.getFrom() + " -> " + t.getTo() + " " + Money.format(t.getCents());
        }
        return "#" + t.getId() + " " + text + (t.getNote().isEmpty() ? "" : " (" + t.getNote() + ")");
    }
}
