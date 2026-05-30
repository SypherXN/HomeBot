using Microsoft.Data.Sqlite;

public partial class BudgetService
{
    public List<BudgetCategorizeRuleModel> GetCategorizeRules(bool activeOnly = true)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = activeOnly
            ? @"SELECT r.Id, r.MatchField, r.MatchContains, r.CategoryId, c.Name, r.Priority, r.IsActive
                FROM BudgetCategorizeRules r
                JOIN BudgetCategories c ON c.Id = r.CategoryId
                WHERE r.IsActive = 1
                ORDER BY r.Priority DESC, r.Id ASC"
            : @"SELECT r.Id, r.MatchField, r.MatchContains, r.CategoryId, c.Name, r.Priority, r.IsActive
                FROM BudgetCategorizeRules r
                JOIN BudgetCategories c ON c.Id = r.CategoryId
                ORDER BY r.IsActive DESC, r.Priority DESC, r.Id ASC";
        using var r = cmd.ExecuteReader();
        var list = new List<BudgetCategorizeRuleModel>();
        while (r.Read())
        {
            list.Add(new BudgetCategorizeRuleModel
            {
                Id = r.GetInt32(0),
                MatchField = r.GetString(1),
                MatchContains = r.GetString(2),
                CategoryId = r.GetInt32(3),
                CategoryName = r.GetString(4),
                Priority = r.GetInt32(5),
                IsActive = r.GetInt32(6) == 1,
            });
        }

        return list;
    }

    public int CreateCategorizeRule(string matchField, string matchContains, int categoryId, int priority = 0)
    {
        var field = NormalizeMatchField(matchField);
        var needle = matchContains.Trim();
        if (needle.Length == 0)
            throw new ArgumentException("matchContains is required.");

        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO BudgetCategorizeRules (MatchField, MatchContains, CategoryId, Priority)
            VALUES ($f, $m, $c, $p)";
        cmd.Parameters.AddWithValue("$f", field);
        cmd.Parameters.AddWithValue("$m", needle);
        cmd.Parameters.AddWithValue("$c", categoryId);
        cmd.Parameters.AddWithValue("$p", priority);
        cmd.ExecuteNonQuery();
        using var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(idCmd.ExecuteScalar());
    }

    public bool DeleteCategorizeRule(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM BudgetCategorizeRules WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return cmd.ExecuteNonQuery() > 0;
    }

    public int? ResolveCategoryFromRules(string? merchant, string? note)
    {
        var rules = GetCategorizeRules(activeOnly: true);
        foreach (var rule in rules)
        {
            var haystack = rule.MatchField == "note" ? note ?? "" : merchant ?? "";
            if (haystack.Contains(rule.MatchContains, StringComparison.OrdinalIgnoreCase))
                return rule.CategoryId;
        }

        return null;
    }

    private static string NormalizeMatchField(string? field)
    {
        var f = (field ?? "merchant").Trim().ToLowerInvariant();
        return f == "note" ? "note" : "merchant";
    }
}

public sealed class BudgetCategorizeRuleModel
{
    public int Id { get; set; }
    public string MatchField { get; set; } = "merchant";
    public string MatchContains { get; set; } = "";
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = "";
    public int Priority { get; set; }
    public bool IsActive { get; set; } = true;
}
