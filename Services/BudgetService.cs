using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

/// <summary>
/// Household budgeting: categories, transactions, envelopes, goals, accounts, and reporting.
/// </summary>
public partial class BudgetService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;

    public BudgetService(DatabaseService db, UndoService undo)
    {
        _db = db;
        _undo = undo;
        try
        {
            ProcessDueRecurring();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HomeBot Budget] Recurring processing skipped: {ex.Message}");
        }
    }

    public static double EvaluateAmount(string input)
    {
        try
        {
            return Convert.ToDouble(new System.Data.DataTable().Compute(input.Trim(), ""));
        }
        catch
        {
            return 0;
        }
    }

    private int GetPageSize(SqliteConnection conn)
    {
        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();
        if (result != null && int.TryParse(result.ToString(), out int parsed) && parsed > 0)
            return parsed;
        return 10;
    }

    private static string NormalizeMonth(string? month)
    {
        if (!string.IsNullOrWhiteSpace(month) &&
            DateTime.TryParseExact(month.Trim(), "yyyy-MM", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out _))
            return month.Trim();

        return DateTime.UtcNow.ToString("yyyy-MM");
    }

    private static bool MonthContainsDate(string month, string transactionDate)
    {
        if (transactionDate.Length >= 7 && transactionDate.StartsWith(month, StringComparison.Ordinal))
            return true;
        if (DateTime.TryParse(transactionDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
            return dt.ToString("yyyy-MM") == month;
        return false;
    }

    private void Audit(ulong actor, string entityType, int entityId, string action, object? data = null)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetAuditLog (EntityType, EntityId, ActorUserId, Action, DataJson)
            VALUES ($t, $id, $actor, $action, $json)";
        cmd.Parameters.AddWithValue("$t", entityType);
        cmd.Parameters.AddWithValue("$id", entityId);
        cmd.Parameters.AddWithValue("$actor", (long)actor);
        cmd.Parameters.AddWithValue("$action", action);
        cmd.Parameters.AddWithValue("$json", data == null ? DBNull.Value : JsonSerializer.Serialize(data));
        cmd.ExecuteNonQuery();
    }

    private static double ToHomeAmount(double amount, double exchangeRate) =>
        exchangeRate <= 0 ? amount : amount * exchangeRate;

    // ——— Categories ———

    public List<BudgetCategoryModel> GetCategories()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, Color, Icon, Visibility, IsTaxDeductible, SortOrder
            FROM BudgetCategories ORDER BY SortOrder, Name";
        using var reader = cmd.ExecuteReader();
        var list = new List<BudgetCategoryModel>();
        while (reader.Read())
            list.Add(ReadCategory(reader));
        return list;
    }

    public int CreateCategory(string name, string? color, string? icon, string visibility, bool isTaxDeductible, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetCategories (Name, Color, Icon, Visibility, IsTaxDeductible)
            VALUES ($n, $c, $i, $v, $tax)";
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$c", (object?)color ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$i", (object?)icon ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$v", visibility is "personal" ? "personal" : "household");
        cmd.Parameters.AddWithValue("$tax", isTaxDeductible ? 1 : 0);
        cmd.ExecuteNonQuery();
        var id = ReadLastId(conn);
        Audit(actor, "category", id, "create");
        return id;
    }

    public bool UpdateCategory(int id, string name, string? color, string? icon, string visibility, bool isTaxDeductible, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE BudgetCategories SET Name=$n, Color=$c, Icon=$i, Visibility=$v, IsTaxDeductible=$tax
            WHERE Id=$id";
        cmd.Parameters.AddWithValue("$n", name.Trim());
        cmd.Parameters.AddWithValue("$c", (object?)color ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$i", (object?)icon ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$v", visibility is "personal" ? "personal" : "household");
        cmd.Parameters.AddWithValue("$tax", isTaxDeductible ? 1 : 0);
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "category", id, "update");
        return ok;
    }

    public bool DeleteCategory(int id, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BudgetCategories WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        var ok = cmd.ExecuteNonQuery() > 0;
        if (ok) Audit(actor, "category", id, "delete");
        return ok;
    }

    private static BudgetCategoryModel ReadCategory(SqliteDataReader reader) => new()
    {
        Id = reader.GetInt32(0),
        Name = reader.GetString(1),
        Color = reader.IsDBNull(2) ? null : reader.GetString(2),
        Icon = reader.IsDBNull(3) ? null : reader.GetString(3),
        Visibility = reader.GetString(4),
        IsTaxDeductible = reader.GetInt64(5) != 0,
        SortOrder = reader.GetInt32(6)
    };

    private static int ReadLastId(SqliteConnection conn)
    {
        using var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(idCmd.ExecuteScalar());
    }
}
