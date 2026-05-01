/// <summary>
/// Standard JSON error body for HomeBot HTTP API (Phase 3).
/// </summary>
/// <param name="error">Human-readable message.</param>
/// <param name="code">Stable machine-readable code (snake_case).</param>
public sealed record ApiErrorBody(string error, string code);
