using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Admin routes for web user management (requires admin JWT or HOMEBOT_API_TOKEN).
/// </summary>
public static class WebAdminApi
{
    public static void MapWebAdminApi(this WebApplication app, IServiceProvider root, string staticApiToken)
    {
        var g = app.MapGroup("/api/admin").RequireRateLimiting("mutation");

        g.MapGet("/users", (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            var auth = root.GetRequiredService<WebAuthService>();
            return Results.Ok(new { users = auth.ListUsers() });
        });

        g.MapGet("/invite-status", (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            return Results.Ok(root.GetRequiredService<WebAuthService>().GetInviteStatus());
        });

        g.MapPost("/invite/rotate", (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            var label = http.Query["label"].ToString();
            var rotated = root.GetRequiredService<WebAuthService>().RotateInviteToken(
                string.IsNullOrWhiteSpace(label) ? null : label);
            if (rotated is null)
                return ApiResults.BadRequest("Could not rotate invite token.", "rotate_failed");
            var (plain, status) = rotated.Value;
            return Results.Ok(new
            {
                ok = true,
                inviteToken = plain,
                message = "Save this token now — it will not be shown again.",
                status,
            });
        });

        g.MapPatch("/users/{username}/password", async (HttpRequest http, string username) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            var body = await http.ReadFromJsonAsync<AdminResetPasswordRequest>();
            if (body?.NewPassword is null)
                return ApiResults.Validation("newPassword is required.");

            var auth = root.GetRequiredService<WebAuthService>();
            var resetErr = auth.TryResetPassword(username, body.NewPassword);
            return resetErr ?? Results.Ok(new { ok = true });
        });

        g.MapPost("/users/{username}/deactivate", (HttpRequest http, string username) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            var auth = root.GetRequiredService<WebAuthService>();
            var deactivateErr = auth.TryDeactivateUser(username);
            return deactivateErr ?? Results.Ok(new { ok = true });
        });
    }
}

public sealed class AdminResetPasswordRequest
{
    public string? NewPassword { get; set; }
}

public sealed class BudgetCategorizeRuleCreateRequest
{
    public string? MatchField { get; set; }
    public string? MatchContains { get; set; }
    public int CategoryId { get; set; }
    public int Priority { get; set; }
}
