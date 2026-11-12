# Setup Guide (Windows + Eclipse)

## 1. Install the JDK
1. Download JDK 17 or newer (Temurin / Adoptium, or Oracle).
2. Install, then open Command Prompt and check: `java -version` and `javac -version` (both 17+).
   If `javac` is not found, add the JDK `bin` folder to PATH and set `JAVA_HOME`.

## 2. Import into Eclipse
1. Copy the `PayNet` folder to your computer.
2. Eclipse: **File > Import > General > Existing Projects into Workspace**, browse to the folder, Finish.
3. Check **Project > Properties > Java Build Path > Libraries** uses JRE 17 (or newer). If not: Add Library > JRE System Library > Workspace default / JavaSE-17.
4. The project has a `src` source folder and outputs to `bin`.

## 3. Run configurations (Run > Run Configurations > Java Application > New)
Important: on the **Arguments** tab the working directory must be the project root (default `${workspace_loc:PayNet}`), so `data/` and `web/` are found.

| Name | Project | Main class | Program arguments |
|---|---|---|---|
| Server | PayNet | `com.paynet.server.ServerMain` | (none) |
| Client GUI | PayNet | `com.paynet.client.PayNetGui` | (none; server host entered in the GUI) |
| LoadTest | PayNet | `com.paynet.test.LoadTest` | `20 50` (clients, transfers each; optional host, port) |
| SmokeTest | PayNet | `com.paynet.test.ProtocolSmokeTest` | (none) |

Start Server first. You can run Client GUI several times (Run again, or use Run > Run As multiple instances).
Eclipse's console shows server logs.

## 4. Open the website
With the server running, open http://localhost:8080 in a browser.

## 5. Without Eclipse
Run `scripts\build.bat`, `scripts\run-server.bat`, `scripts\run-gui.bat`, `scripts\run-loadtest.bat` (use `.sh` on Linux/macOS).

## 6. Two laptops on the same Wi-Fi
1. Both laptops join the same Wi-Fi network (a phone hotspot also works; some campus Wi-Fi blocks client-to-client traffic).
2. On the **server laptop** open Command Prompt, run `ipconfig`, and note the **IPv4 Address** of the Wi-Fi adapter (e.g. `192.168.1.23`).
3. Start the server there. When Windows Defender Firewall asks, allow Java on **Private** networks.
   Otherwise add inbound rules for TCP ports **5000** and **8080** (Windows Defender Firewall > Advanced settings > Inbound Rules > New Rule > Port).
4. On the **client laptop** start the GUI and enter the server's IPv4 address (not `localhost`) as host, port 5000.
   Or open `http://192.168.1.23:8080` in its browser.
5. Quick check from the client laptop: `ping 192.168.1.23`. If ping works but the connection fails, it is the firewall.
6. Run a load test remotely: `java -cp bin com.paynet.test.LoadTest 20 50 192.168.1.23`.

## Troubleshooting
- `Address already in use`: another server instance is running; close it (Eclipse red Terminate button).
- Website shows 404 or no files: the working directory is not the project root.
- `Connection refused`: server not started, wrong IP, or firewall.
