// IN-FORM launcher: the program the Start menu and desktop icons run.
//
//   IN-FORM.exe             start IN-FORM with no black window, then open the browser
//                           (if IN-FORM is already running it only opens the browser)
//   IN-FORM.exe --stop      stop the IN-FORM this launcher started
//   --quiet                 never show a dialog; problems go to the log and the exit code
//
// It does what start.bat does, minus the console window. Your setup and history
// stay in %APPDATA%\IN-FORM, the same place the portable zip uses, so switching
// between the two keeps your data. The log is %APPDATA%\IN-FORM\inform.log.
//
// Compiled in CI with the .NET Framework compiler that ships with Windows (C# 5),
// so keep to old syntax: no string interpolation, no ?. and no expression bodies.
// test/installer.test.js checks for that.

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("IN-FORM")]
[assembly: AssemblyProduct("IN-FORM")]
[assembly: AssemblyCompany("JV7T9 - GlyphTek Project")]
[assembly: AssemblyDescription("Starts IN-FORM and opens it in your browser.")]

static class Launcher
{
    const string Title = "IN-FORM";
    static bool quiet;
    static string dataDir;
    static string logFile;
    static string pidFile;

    [STAThread]
    static int Main(string[] args)
    {
        bool stop = false;
        foreach (string a in args)
        {
            if (a == "--stop") stop = true;
            if (a == "--quiet") quiet = true;
        }

        dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "IN-FORM");
        logFile = Path.Combine(dataDir, "inform.log");
        pidFile = Path.Combine(dataDir, "inform.pid");

        try
        {
            Directory.CreateDirectory(dataDir);
            if (stop) return Stop();
            return StartOnce();
        }
        catch (Exception ex)
        {
            return Fail("IN-FORM hit a problem it did not expect:\r\n\r\n" + ex.Message);
        }
    }

    // Two quick double-clicks should not start two servers, so launches take turns.
    static int StartOnce()
    {
        bool owned = false;
        using (Mutex turn = new Mutex(false, "Local\\GlyphTek.IN-FORM.launch"))
        {
            try { owned = turn.WaitOne(30000); }
            catch (AbandonedMutexException) { owned = true; }
            try { return Start(); }
            finally { if (owned) turn.ReleaseMutex(); }
        }
    }

    static int Start()
    {
        int port = Port();
        string url = "http://127.0.0.1:" + port;

        if (IsInForm(port))
        {
            OpenBrowser(url);
            return 0;
        }

        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(appDir, "node.exe");
        if (!File.Exists(node))
        {
            return Fail("node.exe is missing from " + appDir + "\r\n\r\nIN-FORM looks only partly installed. Reinstalling it should fix that.");
        }

        TrimLog();

        // cmd runs node so its output goes to the log file; /s keeps the quoting predictable.
        ProcessStartInfo psi = new ProcessStartInfo();
        string shell = Environment.GetEnvironmentVariable("ComSpec");
        psi.FileName = string.IsNullOrEmpty(shell) ? "cmd.exe" : shell;
        psi.Arguments = "/s /c \"\"" + node + "\" --disable-warning=ExperimentalWarning server\\index.js >> \"" + logFile + "\" 2>&1\"";
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;

        // Same settings as start.bat: one person, this computer only, no sign-in.
        psi.EnvironmentVariables["INFORM_AUTH"] = "off";
        psi.EnvironmentVariables["HOST"] = "127.0.0.1";
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["LOG_LEVEL"] = "warn";
        SetDefault(psi, "DATABASE_PATH", Path.Combine(dataDir, "inform.db"));
        SetDefault(psi, "GENERATE_RATE_LIMIT_PER_MINUTE", "120");

        Process child = Process.Start(psi);
        File.WriteAllText(pidFile, child.Id.ToString());

        // Wait for the server to answer: up to about 25 seconds.
        for (int i = 0; i < 100; i++)
        {
            if (IsInForm(port))
            {
                OpenBrowser(url);
                return 0;
            }
            if (child.HasExited) break;
            Thread.Sleep(250);
        }

        if (IsInForm(port))
        {
            OpenBrowser(url);
            return 0;
        }
        if (child.HasExited && IsListening(port))
        {
            return Fail("Something else on this computer is already using port " + port + ", so IN-FORM could not start.\r\n\r\nClose that program, or ask for help with a different port.");
        }
        return Fail("IN-FORM did not start.\r\n\r\nThe log may say why:\r\n" + logFile);
    }

    static int Stop()
    {
        int port = Port();
        int pid = 0;
        try
        {
            if (File.Exists(pidFile)) int.TryParse(File.ReadAllText(pidFile).Trim(), out pid);
        }
        catch (Exception) { pid = 0; }

        if (pid > 0)
        {
            // Only end the process if it is still the cmd.exe we started, not something
            // that has since been given the same number.
            bool ours = false;
            try { ours = string.Equals(Process.GetProcessById(pid).ProcessName, "cmd", StringComparison.OrdinalIgnoreCase); }
            catch (Exception) { ours = false; }

            if (ours)
            {
                ProcessStartInfo kill = new ProcessStartInfo("taskkill.exe", "/PID " + pid + " /T /F");
                kill.UseShellExecute = false;
                kill.CreateNoWindow = true;
                using (Process p = Process.Start(kill)) { p.WaitForExit(10000); }
            }
            try { File.Delete(pidFile); } catch (Exception) { }
        }

        for (int i = 0; i < 20 && IsInForm(port); i++) Thread.Sleep(250);

        if (!IsInForm(port))
        {
            Tell("IN-FORM is stopped.");
            return 0;
        }
        return Fail("IN-FORM is still running, but it was not started by this launcher.\r\n\r\nIf you started it with start.bat, close that black window instead.");
    }

    static int Port()
    {
        int port;
        if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out port) && port > 0 && port < 65536) return port;
        return 3000;
    }

    static void SetDefault(ProcessStartInfo psi, string name, string value)
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(name))) psi.EnvironmentVariables[name] = value;
    }

    // True only if IN-FORM itself answers (its health check says 200).
    static bool IsInForm(int port)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/health");
            req.Proxy = null;
            req.Timeout = 1500;
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            {
                return res.StatusCode == HttpStatusCode.OK;
            }
        }
        catch (Exception) { return false; }
    }

    // True if anything at all answers on the port.
    static bool IsListening(int port)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/");
            req.Proxy = null;
            req.Timeout = 1500;
            using (req.GetResponse()) { return true; }
        }
        catch (WebException ex) { return ex.Response != null; }
        catch (Exception) { return false; }
    }

    static void OpenBrowser(string url)
    {
        // Set by the installer's own test, which has no one to look at a browser.
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("INFORM_NO_BROWSER"))) return;
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(url);
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
        catch (Exception)
        {
            Tell("IN-FORM is running. Open " + url + " in your browser.");
        }
    }

    // Keep the log from growing without end: start fresh once it passes 1 MB.
    static void TrimLog()
    {
        try
        {
            if (File.Exists(logFile) && new FileInfo(logFile).Length > 1048576) File.Delete(logFile);
        }
        catch (Exception) { }
    }

    static void Tell(string text)
    {
        if (quiet) return;
        MessageBox.Show(text, Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    static int Fail(string text)
    {
        try { File.AppendAllText(logFile, DateTime.Now.ToString("s") + " launcher: " + text.Replace("\r\n", " ") + "\r\n"); }
        catch (Exception) { }
        if (!quiet) MessageBox.Show(text, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
