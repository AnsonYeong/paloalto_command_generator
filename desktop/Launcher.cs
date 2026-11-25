using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Palo Alto Command Generator")]
[assembly: AssemblyProduct("PAN / builder")]
[assembly: AssemblyDescription("Portable local address, service and group command generator")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace PanBuilder
{
    internal static class Program
    {
        internal const string Identity = "PANBuilder.Desktop.1";

        [STAThread]
        private static int Main(string[] args)
        {
            bool headless = false;
            int port = 52473;
            try
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--headless") headless = true;
                    else if (args[i] == "--port" && i + 1 < args.Length && Int32.TryParse(args[++i], out port) && port >= 1024 && port <= 65535) { }
                    else throw new ArgumentException("Supported options: --headless and --port 1024..65535.");
                }
                string url = "http://127.0.0.1:" + port + "/";
                bool created;
                using (var mutex = new Mutex(true, "Local\\PANBuilder.Desktop.Port." + port, out created))
                {
                    if (!created)
                    {
                        if (!IsRunning(url)) throw new IOException("The app is still starting or closing. Wait a moment, then open it again.");
                        if (!headless) OpenBrowser(url);
                        return 0;
                    }
                    try
                    {
                        using (var server = new AssetServer(port))
                        {
                            try { server.Start(); }
                            catch (SocketException)
                            {
                                throw new IOException("Local port " + port + " is already in use. Close the other app using this port, or start this tool with --port followed by another port number. Your workspace is stored separately for each port.");
                            }
                            if (headless)
                            {
                                using (var stop = new ManualResetEvent(false))
                                {
                                    Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; stop.Set(); };
                                    stop.WaitOne();
                                }
                            }
                            else
                            {
                                Application.EnableVisualStyles();
                                Application.SetCompatibleTextRenderingDefault(false);
                                Application.Run(new LauncherWindow(url));
                            }
                        }
                        return 0;
                    }
                    finally { mutex.ReleaseMutex(); }
                }
            }
            catch (Exception error)
            {
                if (headless) Console.Error.WriteLine(error.Message);
                else MessageBox.Show(error.Message, "PAN / builder could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static bool IsRunning(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url + "__pan_builder_health");
                request.Proxy = null;
                request.Timeout = 2000;
                using (var response = request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream()))
                    return reader.ReadToEnd() == Identity;
            }
            catch (WebException) { return false; }
        }

        internal static void OpenBrowser(string url)
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
    }

    internal sealed class LauncherWindow : Form
    {
        internal LauncherWindow(string url)
        {
            Text = "PAN / builder - Local launcher";
            ClientSize = new Size(530, 275);
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = Color.FromArgb(25, 30, 38);
            ForeColor = Color.FromArgb(230, 234, 242);
            Font = new Font("Segoe UI", 10);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

            Controls.Add(new Label { Text = "PAN / builder", Font = new Font("Segoe UI", 22, FontStyle.Bold), Location = new Point(28, 23), AutoSize = true });
            Controls.Add(new Label { Text = "Palo Alto Command Generator  |  v1.0.0", Location = new Point(30, 73), AutoSize = true, ForeColor = Color.FromArgb(170, 180, 194) });
            Controls.Add(new Label { Text = "The tool runs locally in your browser.\nKeep this window open while using it. Closing it stops the app.", Location = new Point(30, 111), Size = new Size(480, 48) });
            Controls.Add(new Label { Text = "Workspace data is saved in this browser. Use Export workspace\nto keep a backup or transfer objects to another computer.", Location = new Point(30, 163), Size = new Size(480, 42), Font = new Font("Segoe UI", 9), ForeColor = Color.FromArgb(170, 180, 194) });

            var open = new Button { Text = "Open app", Location = new Point(276, 219), Size = new Size(110, 35), BackColor = Color.FromArgb(216, 77, 38), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            open.FlatAppearance.BorderSize = 0;
            open.Click += delegate { Open(url); };
            var exit = new Button { Text = "Exit", Location = new Point(399, 219), Size = new Size(100, 35), FlatStyle = FlatStyle.Flat };
            exit.Click += delegate { Close(); };
            Controls.Add(open);
            Controls.Add(exit);
            AcceptButton = open;
            CancelButton = exit;
            Shown += delegate { Open(url); };
        }

        private void Open(string url)
        {
            try { Program.OpenBrowser(url); }
            catch (Exception)
            {
                MessageBox.Show(this, "Open this address in Edge, Chrome, Brave or Firefox:\n\n" + url, "Open the app", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }

    // Static embedded assets only: no filesystem endpoints, uploads or remote bind.
    internal sealed class AssetServer : IDisposable
    {
        private readonly Dictionary<string, byte[]> assets = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        private readonly TcpListener listener;
        private readonly int port;
        private volatile bool stopping;
        private int connections;

        internal AssetServer(int port)
        {
            this.port = port;
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.ExclusiveAddressUse = true;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("PANBuilder.Assets.zip"))
            {
                if (stream == null) throw new InvalidDataException("The executable is missing its embedded application files. Obtain a fresh copy.");
                using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    foreach (var entry in zip.Entries)
                    {
                        if (String.IsNullOrEmpty(entry.Name)) continue;
                        using (var input = entry.Open())
                        using (var output = new MemoryStream())
                        {
                            input.CopyTo(output);
                            assets.Add("/" + entry.FullName.Replace('\\', '/'), output.ToArray());
                        }
                    }
                }
            }
            if (!assets.ContainsKey("/index.html")) throw new InvalidDataException("The embedded application has no index page.");
        }

        internal void Start()
        {
            listener.Start(32);
            var thread = new Thread(AcceptLoop) { IsBackground = true, Name = "PAN builder local assets" };
            thread.Start();
        }

        private void AcceptLoop()
        {
            while (!stopping)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (SocketException) { if (stopping) return; continue; }
                catch (ObjectDisposedException) { return; }
                if (Interlocked.Increment(ref connections) > 32) { Interlocked.Decrement(ref connections); client.Close(); continue; }
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try { Serve(client); }
                    catch (IOException) { }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                    finally { client.Close(); Interlocked.Decrement(ref connections); }
                });
            }
        }

        private void Serve(TcpClient client)
        {
            client.ReceiveTimeout = 5000;
            client.SendTimeout = 5000;
            using (var stream = client.GetStream())
            {
                try { HandleRequest(stream); }
                finally
                {
                    // Finish the response before closing even if a rejected request
                    // has an unread body; otherwise Windows sends a TCP reset.
                    try
                    {
                        client.Client.Shutdown(SocketShutdown.Send);
                        client.ReceiveTimeout = 100;
                        byte[] remaining = new byte[4096];
                        int drained = 0, count;
                        while (drained < 65536 && (count = stream.Read(remaining, 0, remaining.Length)) > 0) drained += count;
                    }
                    catch (IOException) { }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                }
            }
        }

        private void HandleRequest(NetworkStream stream)
        {
                var header = new List<byte>();
                while (header.Count < 16384)
                {
                    int value = stream.ReadByte();
                    if (value < 0) return;
                    header.Add((byte)value);
                    int n = header.Count;
                    if (n >= 4 && header[n - 4] == 13 && header[n - 3] == 10 && header[n - 2] == 13 && header[n - 1] == 10) break;
                }
                if (header.Count >= 16384) { Reply(stream, 431, "Request Header Fields Too Large", "text/plain", new byte[0], false); return; }
                var lines = Encoding.ASCII.GetString(header.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
                var request = lines[0].Split(' ');
                if (request.Length != 3 || (request[2] != "HTTP/1.1" && request[2] != "HTTP/1.0")) { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], false); return; }
                string host = null;
                for (int i = 1; i < lines.Length; i++)
                {
                    if (!lines[i].StartsWith("Host:", StringComparison.OrdinalIgnoreCase)) continue;
                    if (host != null) { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], false); return; }
                    host = lines[i].Substring(5).Trim();
                }
                if (host != "127.0.0.1:" + port && host != "localhost:" + port) { Reply(stream, 403, "Forbidden", "text/plain", new byte[0], false); return; }
                bool head = request[0] == "HEAD";
                if (request[0] != "GET" && !head) { Reply(stream, 405, "Method Not Allowed", "text/plain", new byte[0], false); return; }
                string path;
                try { path = Uri.UnescapeDataString(request[1].Split('?')[0]); }
                catch (UriFormatException) { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], head); return; }
                if (path == "/__pan_builder_health") { Reply(stream, 200, "OK", "text/plain", Encoding.UTF8.GetBytes(Program.Identity), head); return; }
                if (path == "/") path = "/index.html";
                byte[] body;
                if (!assets.TryGetValue(path, out body)) { Reply(stream, 404, "Not Found", "text/plain", Encoding.UTF8.GetBytes("Not found"), head); return; }
                Reply(stream, 200, "OK", ContentType(path), body, head);
        }

        private static string ContentType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".json": return "application/json";
                case ".ttf": return "font/ttf";
                case ".woff2": return "font/woff2";
                case ".txt": return "text/plain; charset=utf-8";
                default: return "application/octet-stream";
            }
        }

        private static void Reply(Stream stream, int code, string status, string type, byte[] body, bool head)
        {
            string headers = "HTTP/1.1 " + code + " " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length +
                "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n" +
                "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\r\n" +
                (code == 405 ? "Allow: GET, HEAD\r\n" : "") + "\r\n";
            byte[] bytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(bytes, 0, bytes.Length);
            if (!head) stream.Write(body, 0, body.Length);
        }

        public void Dispose()
        {
            stopping = true;
            listener.Stop();
        }
    }
}
