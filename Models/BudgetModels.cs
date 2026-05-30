/// <summary>DTOs for household budgeting (separate from Money IOU tracking).</summary>
public sealed class BudgetCategoryModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public string Visibility { get; set; } = "household";
    public bool IsTaxDeductible { get; set; }
    public int SortOrder { get; set; }
}

public sealed class BudgetAccountModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string AccountType { get; set; } = "checking";
    public string Currency { get; set; } = "USD";
    public double? CreditLimit { get; set; }
    public double CurrentBalance { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class BudgetTransactionSplitModel
{
    public int Id { get; set; }
    public int? CategoryId { get; set; }
    public ulong? SpentByUserId { get; set; }
    public double Amount { get; set; }
}

public sealed class BudgetTransactionListItemModel
{
    public int Id { get; set; }
    public string Type { get; set; } = "";
    public double Amount { get; set; }
    public string? AmountInput { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public ulong SpentByUserId { get; set; }
    public string SpentByMemberLabel { get; set; } = "";
    public int? AccountId { get; set; }
    public int? TransferToAccountId { get; set; }
    public string? Note { get; set; }
    public string? ReceiptUrl { get; set; }
    public string? Merchant { get; set; }
    public string TransactionDate { get; set; } = "";
    public string? ClearedAt { get; set; }
    public bool IsPending { get; set; }
    public string Currency { get; set; } = "USD";
    public double ExchangeRateToHome { get; set; } = 1;
    public List<string> Tags { get; set; } = new();
    public List<BudgetTransactionSplitModel> Splits { get; set; } = new();
}

public sealed class BudgetSummarySliceModel
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public double Total { get; set; }
    public double Percent { get; set; }
}

public sealed class BudgetMonthSummaryModel
{
    public string Month { get; set; } = "";
    public double TotalIncome { get; set; }
    public double TotalExpenses { get; set; }
    public double Net { get; set; }
}

public sealed class BudgetEnvelopeModel
{
    public int Id { get; set; }
    public string Month { get; set; } = "";
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = "";
    public double TargetAmount { get; set; }
    public double ActualAmount { get; set; }
    public double Remaining { get; set; }
    public double PercentUsed { get; set; }
}

public sealed class BudgetGoalModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public double TargetAmount { get; set; }
    public double CurrentAmount { get; set; }
    public string? TargetDate { get; set; }
    public int? CategoryId { get; set; }
    public double PercentComplete { get; set; }
}

public sealed class BudgetIncomePlanModel
{
    public string Month { get; set; } = "";
    public double PlannedAmount { get; set; }
    public double AllocatedEnvelopes { get; set; }
    public double AvailableToBudget { get; set; }
}

public sealed class BudgetForecastCategoryModel
{
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = "";
    public double MonthToDate { get; set; }
    public double ProjectedMonthEnd { get; set; }
    public double? EnvelopeTarget { get; set; }
}

public sealed class BudgetBillModel
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public double AmountEstimate { get; set; }
    public int DueDay { get; set; }
    public int? CategoryId { get; set; }
    public int? CalendarItemId { get; set; }
    public bool IsActive { get; set; }
}

public sealed class BudgetRecurringModel
{
    public int Id { get; set; }
    public double Amount { get; set; }
    public string? AmountInput { get; set; }
    public int? CategoryId { get; set; }
    public ulong SpentByUserId { get; set; }
    public string Cadence { get; set; } = "monthly";
    public string NextRunDate { get; set; } = "";
    public string? Note { get; set; }
    public string? Merchant { get; set; }
    public string Type { get; set; } = "expense";
    public bool IsActive { get; set; }
    public int? AccountId { get; set; }
}

public sealed class BudgetAuditEntryModel
{
    public int Id { get; set; }
    public string EntityType { get; set; } = "";
    public int EntityId { get; set; }
    public ulong ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public string? DataJson { get; set; }
    public string CreatedAt { get; set; } = "";
}

public sealed class BudgetTrendPointModel
{
    public string Month { get; set; } = "";
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public double Total { get; set; }
}

public sealed class BudgetTaxSummaryLineModel
{
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = "";
    public double Total { get; set; }
}

public sealed class BudgetNotificationItemModel
{
    public string Key { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Message { get; set; } = "";
}

public sealed class BudgetExchangeRateModel
{
    public int Id { get; set; }
    public string FromCurrency { get; set; } = "";
    public string ToCurrency { get; set; } = "";
    public double Rate { get; set; }
    public string EffectiveDate { get; set; } = "";
}
