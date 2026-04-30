using System.Data;

/// <summary>
/// Lightweight expression evaluator used for money inputs.
/// </summary>
public static class MathParser
{
    /// <summary>
    /// Evaluates a numeric expression using <see cref="DataTable.Compute"/>.
    /// </summary>
    public static double Evaluate(string expression)
    {
        var table = new DataTable();
        return Convert.ToDouble(table.Compute(expression, ""));
    }
}