using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;

/// <summary>Meal recipes and weekly/daily meal plan with buy-list and calendar integration.</summary>
public sealed class MealPlanningService
{
    private readonly DatabaseService _db;
    private readonly BuyService _buy;
    private readonly CalendarService _calendar;
    private readonly ConfigService _config;

    public MealPlanningService(
        DatabaseService db,
        BuyService buy,
        CalendarService calendar,
        ConfigService config)
    {
        _db = db;
        _buy = buy;
        _calendar = calendar;
        _config = config;
    }

    public List<MealRecipeModel> ListRecipes()
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id, Name, Description, IngredientsJson, Instructions, Servings, Tags, CreatedAt FROM MealRecipes ORDER BY Name COLLATE NOCASE";
        return ReadRecipes(cmd);
    }

    public int CreateRecipe(MealRecipeCreateModel model)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO MealRecipes (Name, Description, IngredientsJson, Instructions, Servings, Tags)
            VALUES ($n, $d, $ing, $inst, $s, $t)";
        cmd.Parameters.AddWithValue("$n", model.Name.Trim());
        cmd.Parameters.AddWithValue("$d", (object?)model.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ing", SerializeIngredients(model.Ingredients ?? []));
        cmd.Parameters.AddWithValue("$inst", (object?)model.Instructions ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$s", model.Servings <= 0 ? 4 : model.Servings);
        cmd.Parameters.AddWithValue("$t", (object?)model.Tags ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        using var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(idCmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    public bool DeleteRecipe(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var calIds = new List<int>();
        using (var list = conn.CreateCommand())
        {
            list.CommandText = "SELECT CalendarItemId FROM MealPlanEntries WHERE RecipeId = $id AND CalendarItemId IS NOT NULL";
            list.Parameters.AddWithValue("$id", id);
            using var r = list.ExecuteReader();
            while (r.Read())
                calIds.Add(r.GetInt32(0));
        }

        foreach (var calId in calIds)
            _calendar.DeleteItem(calId, 0);

        using var tx = conn.BeginTransaction();
        var delPlan = conn.CreateCommand();
        delPlan.Transaction = tx;
        delPlan.CommandText = "DELETE FROM MealPlanEntries WHERE RecipeId = $id";
        delPlan.Parameters.AddWithValue("$id", id);
        delPlan.ExecuteNonQuery();
        var del = conn.CreateCommand();
        del.Transaction = tx;
        del.CommandText = "DELETE FROM MealRecipes WHERE Id = $id";
        del.Parameters.AddWithValue("$id", id);
        var ok = del.ExecuteNonQuery() > 0;
        tx.Commit();
        return ok;
    }

    public List<MealPlanEntryModel> GetPlan(string fromDate, string toDate)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT e.Id, e.PlanDate, e.MealSlot, e.RecipeId, r.Name, e.CustomLabel, e.Notes, e.CalendarItemId
            FROM MealPlanEntries e
            LEFT JOIN MealRecipes r ON r.Id = e.RecipeId
            WHERE e.PlanDate >= $from AND e.PlanDate <= $to
            ORDER BY e.PlanDate, e.MealSlot, e.Id";
        cmd.Parameters.AddWithValue("$from", fromDate);
        cmd.Parameters.AddWithValue("$to", toDate);
        using var r = cmd.ExecuteReader();
        var list = new List<MealPlanEntryModel>();
        while (r.Read())
        {
            list.Add(new MealPlanEntryModel
            {
                Id = r.GetInt32(0),
                PlanDate = r.GetString(1),
                MealSlot = r.GetString(2),
                RecipeId = r.IsDBNull(3) ? null : r.GetInt32(3),
                RecipeName = r.IsDBNull(4) ? null : r.GetString(4),
                CustomLabel = r.IsDBNull(5) ? null : r.GetString(5),
                Notes = r.IsDBNull(6) ? null : r.GetString(6),
                CalendarItemId = r.IsDBNull(7) ? null : r.GetInt32(7),
            });
        }

        return list;
    }

    public int AddPlanEntry(MealPlanEntryCreateModel model, ulong actor = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO MealPlanEntries (PlanDate, MealSlot, RecipeId, CustomLabel, Notes)
            VALUES ($d, $s, $r, $l, $n)";
        cmd.Parameters.AddWithValue("$d", model.PlanDate);
        cmd.Parameters.AddWithValue("$s", model.MealSlot);
        cmd.Parameters.AddWithValue("$r", (object?)model.RecipeId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$l", (object?)model.CustomLabel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$n", (object?)model.Notes ?? DBNull.Value);
        cmd.ExecuteNonQuery();
        using var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        var id = Convert.ToInt32(idCmd.ExecuteScalar(), CultureInfo.InvariantCulture);

        if (model.AddToCalendar && actor != 0)
            AttachCalendar(id, actor);

        return id;
    }

    public int? AddPlanEntryToCalendar(int planEntryId, ulong actor) => AttachCalendar(planEntryId, actor);

    public bool DeletePlanEntry(int id)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var get = conn.CreateCommand();
        get.CommandText = "SELECT CalendarItemId FROM MealPlanEntries WHERE Id = $id";
        get.Parameters.AddWithValue("$id", id);
        var calObj = get.ExecuteScalar();
        if (calObj is not null and not DBNull)
            _calendar.DeleteItem(Convert.ToInt32(calObj, CultureInfo.InvariantCulture), 0);

        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM MealPlanEntries WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return cmd.ExecuteNonQuery() > 0;
    }

    public int AddPlanIngredientsToBuyList(int planEntryId, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT r.IngredientsJson, r.Name, e.PlanDate, e.MealSlot
            FROM MealPlanEntries e
            JOIN MealRecipes r ON r.Id = e.RecipeId
            WHERE e.Id = $id";
        cmd.Parameters.AddWithValue("$id", planEntryId);
        using var r = cmd.ExecuteReader();
        if (!r.Read())
            return 0;

        var ingredients = DeserializeIngredients(r.GetString(0));
        var recipeName = r.GetString(1);
        var date = r.GetString(2);
        var slot = r.GetString(3);
        var tag = $"meal-{date}";

        foreach (var ing in ingredients)
        {
            if (string.IsNullOrWhiteSpace(ing.Name)) continue;
            _buy.AddItem(
                ing.Name.Trim(),
                string.IsNullOrWhiteSpace(ing.Quantity) ? "1" : ing.Quantity.Trim(),
                "",
                null,
                tag,
                $"{recipeName} ({slot})",
                actor);
        }

        return ingredients.Count;
    }

    public string BuildPlanText(string fromDate, string toDate)
    {
        var entries = GetPlan(fromDate, toDate);
        if (entries.Count == 0)
            return $"No meals planned ({fromDate} – {toDate}).";

        var lines = entries
            .GroupBy(e => e.PlanDate)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g =>
            {
                var day = string.Join("\n", g.Select(e => $"• **{TitleCaseSlot(e.MealSlot)}:** {DisplayLabel(e)}"));
                return $"**{g.Key}**\n{day}";
            });
        return string.Join("\n\n", lines);
    }

    public string BuildTonightText()
    {
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var entries = GetPlan(today, today)
            .Where(e => string.Equals(e.MealSlot, "dinner", StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (entries.Count == 0)
            return $"Nothing planned for dinner on {today}.";
        return string.Join("\n", entries.Select(e => $"🍽️ **{DisplayLabel(e)}**"));
    }

    private int? AttachCalendar(int planEntryId, ulong actor)
    {
        using var conn = _db.GetConnection();
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT e.PlanDate, e.MealSlot, e.CustomLabel, e.Notes, r.Name, e.CalendarItemId
            FROM MealPlanEntries e
            LEFT JOIN MealRecipes r ON r.Id = e.RecipeId
            WHERE e.Id = $id";
        cmd.Parameters.AddWithValue("$id", planEntryId);
        using var r = cmd.ExecuteReader();
        if (!r.Read())
            return null;

        if (!r.IsDBNull(5))
            return r.GetInt32(5);

        var planDate = r.GetString(0);
        var slot = r.GetString(1);
        var custom = r.IsDBNull(2) ? null : r.GetString(2);
        var notes = r.IsDBNull(3) ? "" : r.GetString(3) ?? "";
        var recipeName = r.IsDBNull(4) ? null : r.GetString(4);
        r.Close();

        var label = !string.IsNullOrWhiteSpace(custom) ? custom : recipeName ?? "Meal";
        var title = $"{TitleCaseSlot(slot)}: {label}";
        var tz = _config.Get("timezone") ?? "UTC";
        var (start, end) = SlotTimes(planDate, slot);

        var calId = _calendar.AddItem(title, "event", start, end, false, "30m", null, notes, "", "", "", tz);
        using var upd = conn.CreateCommand();
        upd.CommandText = "UPDATE MealPlanEntries SET CalendarItemId = $c WHERE Id = $id";
        upd.Parameters.AddWithValue("$c", calId);
        upd.Parameters.AddWithValue("$id", planEntryId);
        upd.ExecuteNonQuery();
        return calId;
    }

    private static string DisplayLabel(MealPlanEntryModel e) =>
        !string.IsNullOrWhiteSpace(e.CustomLabel) ? e.CustomLabel! :
        !string.IsNullOrWhiteSpace(e.RecipeName) ? e.RecipeName! : "TBD";

    private static string TitleCaseSlot(string slot) =>
        string.IsNullOrWhiteSpace(slot) ? "Meal" : char.ToUpperInvariant(slot[0]) + slot[1..].ToLowerInvariant();

    private static (string Start, string End) SlotTimes(string planDate, string slot)
    {
        var hour = slot.Trim().ToLowerInvariant() switch
        {
            "breakfast" => 8,
            "lunch" => 12,
            "snack" => 15,
            _ => 18,
        };
        return ($"{planDate} {hour:00}:00", $"{planDate} {hour + 1:00}:00");
    }

    private static string SerializeIngredients(List<MealIngredientModel> items) =>
        JsonSerializer.Serialize(items);

    private static List<MealIngredientModel> DeserializeIngredients(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<MealIngredientModel>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<MealRecipeModel> ReadRecipes(SqliteCommand cmd)
    {
        using var r = cmd.ExecuteReader();
        var list = new List<MealRecipeModel>();
        while (r.Read())
        {
            list.Add(new MealRecipeModel
            {
                Id = r.GetInt32(0),
                Name = r.GetString(1),
                Description = r.IsDBNull(2) ? null : r.GetString(2),
                Ingredients = DeserializeIngredients(r.GetString(3)),
                Instructions = r.IsDBNull(4) ? null : r.GetString(4),
                Servings = r.GetInt32(5),
                Tags = r.IsDBNull(6) ? null : r.GetString(6),
                CreatedAt = r.GetString(7),
            });
        }

        return list;
    }
}

public sealed class MealRecipeModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public List<MealIngredientModel> Ingredients { get; set; } = [];
    public string? Instructions { get; set; }
    public int Servings { get; set; } = 4;
    public string? Tags { get; set; }
    public string CreatedAt { get; set; } = "";
}

public sealed class MealIngredientModel
{
    public string Name { get; set; } = "";
    public string? Quantity { get; set; }
}

public sealed class MealRecipeCreateModel
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public List<MealIngredientModel>? Ingredients { get; set; }
    public string? Instructions { get; set; }
    public int Servings { get; set; } = 4;
    public string? Tags { get; set; }
}

public sealed class MealPlanEntryModel
{
    public int Id { get; set; }
    public string PlanDate { get; set; } = "";
    public string MealSlot { get; set; } = "";
    public int? RecipeId { get; set; }
    public string? RecipeName { get; set; }
    public string? CustomLabel { get; set; }
    public string? Notes { get; set; }
    public int? CalendarItemId { get; set; }
}

public sealed class MealPlanEntryCreateModel
{
    public string PlanDate { get; set; } = "";
    public string MealSlot { get; set; } = "dinner";
    public int? RecipeId { get; set; }
    public string? CustomLabel { get; set; }
    public string? Notes { get; set; }
    public bool AddToCalendar { get; set; }
}
