/// <summary>
/// Minimal console logger used by interaction and button handlers.
/// </summary>
public class LoggingService
{
    /// <summary>
    /// Writes an informational log entry.
    /// </summary>
    public void Info(string message)
    {
        Console.WriteLine($"[INFO] {DateTime.Now:HH:mm:ss} - {message}");
    }

    /// <summary>
    /// Writes an error log entry.
    /// </summary>
    public void Error(string message)
    {
        Console.WriteLine($"[ERROR] {DateTime.Now:HH:mm:ss} - {message}");
    }

    /// <summary>
    /// Writes exception details and stack trace.
    /// </summary>
    public void Exception(Exception ex)
    {
        Console.WriteLine($"[EXCEPTION] {DateTime.Now:HH:mm:ss}");
        Console.WriteLine(ex.ToString());
    }
}