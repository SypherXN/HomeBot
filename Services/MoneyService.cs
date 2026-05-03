using System.Globalization;
using Microsoft.Data.Sqlite;

/// <summary>
/// Tracks expenses/payments and builds balance and transaction views.
/// </summary>
public class MoneyService
{
    private readonly DatabaseService _db;
    private readonly UndoService _undo;

    public MoneyService(DatabaseService db, UndoService undo)
    {
        _db = db;
        _undo = undo;
    }

    /// <summary>
    /// Evaluates a numeric expression and returns 0 if invalid.
    /// </summary>
    public double Evaluate(string input)
    {
        try
        {
            return Convert.ToDouble(new System.Data.DataTable().Compute(input, ""));
        }
        catch
        {
            return 0;
        }
    }

    /// <summary>
    /// Adds a direct expense transaction and logs undo metadata.
    /// </summary>
    public void AddExpense(string name, string amountInput, ulong paidBy, ulong owedBy)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        double amount = Evaluate(amountInput);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO Transactions (Name, Amount, AmountInput, PaidBy, OwedBy, Type)
            VALUES ($name, $amount, $input, $paidBy, $owedBy, 'expense')";

        cmd.Parameters.AddWithValue("$name", name);
        cmd.Parameters.AddWithValue("$amount", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$paidBy", (long)paidBy);
        cmd.Parameters.AddWithValue("$owedBy", (long)owedBy);

        cmd.ExecuteNonQuery();

        var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        int id = ReadLastInsertRowId(idCmd);

        _undo.LogAction(paidBy, "create", "money", id, "");
    }

    /// <summary>
    /// Adds a payment transaction and logs undo metadata.
    /// </summary>
    public void AddPayment(string amountInput, ulong paidBy, ulong receivedBy)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        double amount = Evaluate(amountInput);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO Transactions (Name, Amount, AmountInput, PaidBy, OwedBy, Type)
            VALUES ('Payment', $amount, $input, $paidBy, $owedBy, 'payment')";

        cmd.Parameters.AddWithValue("$amount", amount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$paidBy", (long)paidBy);
        cmd.Parameters.AddWithValue("$owedBy", (long)receivedBy);

        cmd.ExecuteNonQuery();

        var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        int id = ReadLastInsertRowId(idCmd);

        _undo.LogAction(paidBy, "create", "money", id, "");
    }

    /// <summary>
    /// Computes net balance between two users from all transactions.
    /// </summary>
    public double GetNetBalance(ulong user1, ulong user2)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Amount, PaidBy, OwedBy, Type
            FROM Transactions";

        using var reader = cmd.ExecuteReader();

        double balance = 0;

        while (reader.Read())
        {
            double amount = reader.GetDouble(0);
            ulong paidBy = (ulong)reader.GetInt64(1);
            ulong owedBy = (ulong)reader.GetInt64(2);
            string type = reader.GetString(3);

            if (type == "expense")
            {
                // If YOU paid and THEY owe → they owe you
                if (paidBy == user1 && owedBy == user2)
                    balance += amount;

                // If THEY paid and YOU owe → you owe them
                if (paidBy == user2 && owedBy == user1)
                    balance -= amount;
            }
            else if (type == "payment")
            {
                // If YOU paid THEM → reduces what you owe
                if (paidBy == user1 && owedBy == user2)
                    balance += amount;

                // If THEY paid YOU → reduces what they owe
                if (paidBy == user2 && owedBy == user1)
                    balance -= amount;
            }
        }

        return balance;
    }

    /// <summary>
    /// Returns pairwise summary data for API and UI adapters.
    /// </summary>
    public MoneySummaryModel GetSummary(
        ulong user1,
        ulong user2,
        string name1,
        string name2)
    {
        return new MoneySummaryModel
        {
            User1Id = user1,
            User2Id = user2,
            User1Name = name1,
            User1MemberLabel = HouseholdIdentity.MemberLabel(user1),
            User2Name = name2,
            User2MemberLabel = HouseholdIdentity.MemberLabel(user2),
            Balance = GetNetBalance(user1, user2)
        };
    }

    /// <summary>
    /// Returns non-zero balances against all other transacting users.
    /// </summary>
    public Dictionary<ulong, double> GetAllBalances(ulong user)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT DISTINCT PaidBy, OwedBy
            FROM Transactions";

        using var reader = cmd.ExecuteReader();

        var users = new HashSet<ulong>();

        while (reader.Read())
        {
            ulong paidBy = (ulong)reader.GetInt64(0);
            ulong owedBy = (ulong)reader.GetInt64(1);

            if (paidBy != user)
                users.Add(paidBy);

            if (owedBy != user)
                users.Add(owedBy);
        }

        var balances = new Dictionary<ulong, double>();

        foreach (var other in users)
        {
            double balance = GetNetBalance(user, other);

            if (balance != 0)
                balances[other] = balance;
        }

        return balances;
    }

    /// <summary>
    /// Returns paginated transaction data for API and UI adapters.
    /// </summary>
    public PagedResult<MoneyTransactionListItemModel> GetTransactions(int page = 0)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        int pageSize = 5;

        var configCmd = conn.CreateCommand();
        configCmd.CommandText = "SELECT Value FROM Settings WHERE Key = 'page_size'";
        var result = configCmd.ExecuteScalar();

        if (result != null && int.TryParse(result.ToString(), out int parsed))
            pageSize = parsed;

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, Name, Amount, PaidBy, OwedBy, Type
            FROM Transactions
            ORDER BY Id DESC";

        using var reader = cmd.ExecuteReader();

        var allItems = new List<MoneyTransactionListItemModel>();

        while (reader.Read())
        {
            var paidBy = (ulong)reader.GetInt64(3);
            var owedBy = (ulong)reader.GetInt64(4);

            allItems.Add(new MoneyTransactionListItemModel
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                Amount = reader.GetDouble(2),
                PaidBy = paidBy,
                PaidByMemberLabel = HouseholdIdentity.MemberLabel(paidBy),
                OwedBy = owedBy,
                OwedByMemberLabel = HouseholdIdentity.MemberLabel(owedBy),
                Type = reader.GetString(5)
            });
        }

        var paged = allItems
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        bool hasNext = allItems.Count > (page + 1) * pageSize;
        bool hasPrev = page > 0;

        return new PagedResult<MoneyTransactionListItemModel>
        {
            Items = paged,
            Page = page,
            PageSize = pageSize,
            TotalCount = allItems.Count,
            HasNext = hasNext,
            HasPrev = hasPrev
        };
    }

    /// <summary>
    /// Adds an expense where owed amount is computed from a percentage split.
    /// </summary>
    public void AddPercentageExpense(
        string name,
        string description,
        string notes,
        string amountInput,
        ulong paidBy,
        ulong owedBy,
        int percent)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        double total = Evaluate(amountInput);
        double owedAmount = total * (percent / 100.0);

        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO Transactions 
            (Name, Description, Notes, Amount, AmountInput, PaidBy, OwedBy, Type)
            VALUES ($name, $desc, $notes, $amount, $input, $paidBy, $owedBy, 'expense')";

        cmd.Parameters.AddWithValue("$name", name);
        cmd.Parameters.AddWithValue("$desc", description);
        cmd.Parameters.AddWithValue("$notes", notes);
        cmd.Parameters.AddWithValue("$amount", owedAmount);
        cmd.Parameters.AddWithValue("$input", amountInput);
        cmd.Parameters.AddWithValue("$paidBy", (long)paidBy);
        cmd.Parameters.AddWithValue("$owedBy", (long)owedBy);

        cmd.ExecuteNonQuery();

        var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid()";
        int id = ReadLastInsertRowId(idCmd);

        _undo.LogAction(paidBy, "create", "money", id, "");
    }

    /// <summary>
    /// Applies partial updates to an existing transaction.
    /// </summary>
    public void EditTransaction(
        int id,
        string name,
        string description,
        string notes,
        string amountInput)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var updates = new List<string>();
        var cmd = conn.CreateCommand();

        if (!string.IsNullOrWhiteSpace(name))
        {
            updates.Add("Name = $name");
            cmd.Parameters.AddWithValue("$name", name);
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            updates.Add("Description = $desc");
            cmd.Parameters.AddWithValue("$desc", description);
        }

        if (!string.IsNullOrWhiteSpace(notes))
        {
            updates.Add("Notes = $notes");
            cmd.Parameters.AddWithValue("$notes", notes);
        }

        if (!string.IsNullOrWhiteSpace(amountInput))
        {
            double amount = Evaluate(amountInput);

            updates.Add("Amount = $amount");
            updates.Add("AmountInput = $input");

            cmd.Parameters.AddWithValue("$amount", amount);
            cmd.Parameters.AddWithValue("$input", amountInput);
        }

        if (updates.Count == 0)
            return;

        cmd.CommandText = $@"
            UPDATE Transactions 
            SET {string.Join(", ", updates)}
            WHERE Id = $id";

        cmd.Parameters.AddWithValue("$id", id);

        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Deletes a transaction and logs payload needed for undo restoration.
    /// </summary>
    public void DeleteTransaction(int id, ulong userId)
    {
        using var conn = _db.GetConnection();
        conn.Open();

        var getCmd = conn.CreateCommand();
        getCmd.CommandText = @"
            SELECT Name, Description, Notes, Amount, AmountInput, PaidBy, OwedBy, Type
            FROM Transactions
            WHERE Id = $id";

        getCmd.Parameters.AddWithValue("$id", id);

        using var reader = getCmd.ExecuteReader();

        if (!reader.Read())
            return;

        var data = new MoneyUndoModel
        {
            Name = reader.GetString(0),
            Description = reader.IsDBNull(1) ? "" : reader.GetString(1),
            Notes = reader.IsDBNull(2) ? "" : reader.GetString(2),
            Amount = reader.GetDouble(3),
            AmountInput = reader.GetString(4),
            PaidBy = (ulong)reader.GetInt64(5),
            OwedBy = (ulong)reader.GetInt64(6),
            Type = reader.GetString(7)
        };

        reader.Close();

        string json = System.Text.Json.JsonSerializer.Serialize(data);

        _undo.LogAction(userId, "delete", "money", id, json);

        var deleteCmd = conn.CreateCommand();
        deleteCmd.CommandText = "DELETE FROM Transactions WHERE Id = $id";
        deleteCmd.Parameters.AddWithValue("$id", id);

        deleteCmd.ExecuteNonQuery();
    }

    private static int ReadLastInsertRowId(SqliteCommand idCmd)
    {
        var v = idCmd.ExecuteScalar();
        ArgumentNullException.ThrowIfNull(v);
        return Convert.ToInt32(Convert.ToInt64(v, CultureInfo.InvariantCulture));
    }
}