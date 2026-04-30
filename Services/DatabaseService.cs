using Microsoft.Data.Sqlite;

/// <summary>
/// Creates SQLite connections and ensures required tables exist.
/// </summary>
public class DatabaseService
{
    private readonly string _connectionString;

    /// <summary>
    /// Opens or creates the default <c>homebot.db</c>, or uses <c>HOMEBOT_DATABASE_PATH</c> when set.
    /// </summary>
    public DatabaseService()
        : this(null)
    {
    }

    /// <summary>
    /// Uses an explicit SQLite file path or connection string (integration tests; avoids env var races when tests run in parallel).
    /// Pass a full file path, or a string already starting with <c>Data Source=</c>.
    /// </summary>
    /// <param name="sqliteFileOrConnectionString">When null, same behavior as the parameterless constructor.</param>
    public DatabaseService(string? sqliteFileOrConnectionString)
    {
        if (!string.IsNullOrWhiteSpace(sqliteFileOrConnectionString))
        {
            var raw = sqliteFileOrConnectionString.Trim();
            _connectionString = raw.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase)
                ? raw
                : $"Data Source={raw}";
        }
        else
        {
            var path = Environment.GetEnvironmentVariable("HOMEBOT_DATABASE_PATH");
            _connectionString = string.IsNullOrWhiteSpace(path)
                ? "Data Source=homebot.db"
                : path.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase)
                    ? path
                    : $"Data Source={path}";
        }

        Initialize();
    }

    /// <summary>
    /// Initializes all database tables used by the bot.
    /// </summary>
    private void Initialize()
    {
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();

        var cmd = conn.CreateCommand();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS BuyItems (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Quantity TEXT,
            Store TEXT,
            AssignedTo INTEGER,
            Tags TEXT,
            Notes TEXT,
            CreatedBy INTEGER,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            PurchasedBy INTEGER,
            Status TEXT
        );";

        cmd.ExecuteNonQuery();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS Settings (
            Key TEXT PRIMARY KEY,
            Value TEXT
        );

        CREATE TABLE IF NOT EXISTS ChannelBindings (
            Feature TEXT PRIMARY KEY,
            ChannelId INTEGER
        );";

        cmd.ExecuteNonQuery();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS ActionLog (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            UserId INTEGER,
            ActionType TEXT,
            EntityType TEXT,
            EntityId INTEGER,
            Data TEXT,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );";

        cmd.ExecuteNonQuery();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS WishlistItems (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Owner INTEGER,
            Price TEXT,
            Link TEXT,
            Description TEXT,
            Notes TEXT,
            Priority TEXT,
            Tags TEXT,
            PurchasedBy INTEGER,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            Status TEXT
        );";

        cmd.ExecuteNonQuery();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS Transactions (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT,
            Description TEXT,
            Notes TEXT,
            Amount REAL,
            AmountInput TEXT,
            PaidBy INTEGER,
            OwedBy INTEGER,
            Type TEXT,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );";

        cmd.ExecuteNonQuery();

        cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS CalendarItems (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Title TEXT,
            Description TEXT,
            Notes TEXT,
            Type TEXT,
            AssignedTo INTEGER,
            StartDateTime TEXT,
            EndDateTime TEXT,
            AllDay INTEGER,
            ReminderOffset TEXT,
            ReminderSent INTEGER DEFAULT 0,
            Recurrence TEXT,
            Timezone TEXT,
            Link TEXT,
            Status TEXT,
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );";

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Returns a new SQLite connection instance.
    /// </summary>
    public SqliteConnection GetConnection()
    {
        return new SqliteConnection(_connectionString);
    }
}