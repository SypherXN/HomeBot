using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>Ops health dashboard and Prometheus metrics.</summary>
public static class OpsApiRegistration
{
    public static void MapOpsApi(this WebApplication app, IServiceProvider root, string staticApiToken)
    {
        app.MapGet("/api/ops/health", (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            return Results.Ok(root.GetRequiredService<OpsMetricsService>().GetDetailedHealth());
        });

        app.MapGet("/api/ops/metrics", (HttpRequest http) =>
        {
            if (!WebAdminAuth.TryRequireAdmin(http, root, staticApiToken, out var err))
                return err!;
            var accept = http.Headers.Accept.ToString();
            if (accept.Contains("text/plain", StringComparison.OrdinalIgnoreCase) ||
                accept.Contains("openmetrics", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Text(
                    root.GetRequiredService<OpsMetricsService>().RenderPrometheusText(),
                    "text/plain; version=0.0.4; charset=utf-8");
            }

            return Results.Ok(new
            {
                format = "prometheus",
                hint = "Accept: text/plain for Prometheus scrape",
                text = root.GetRequiredService<OpsMetricsService>().RenderPrometheusText(),
            });
        });
    }
}
