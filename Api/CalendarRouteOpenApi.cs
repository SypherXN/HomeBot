#pragma warning disable ASPDEPR002 // WithOpenApi still the supported way to attach summaries in minimal APIs until we migrate to the newer OpenAPI pipeline.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.OpenApi;

/// <summary>
/// OpenAPI summaries for calendar routes that use query <c>instanceStartUtc</c> (minimal APIs do not infer these from <see cref="HttpRequest"/>).
/// </summary>
public static class CalendarRouteOpenApi
{
    public static RouteHandlerBuilder WithCalendarItemGetDocs(this RouteHandlerBuilder builder) =>
        builder.WithOpenApi(operation =>
        {
            operation.Summary = "Get calendar item";
            operation.Description =
                "Returns one calendar row. **Query `instanceStartUtc`** (optional): ISO 8601 UTC canonical occurrence start, e.g. `2026-04-16T09:00:00Z`. " +
                "When set on a recurring item, the response merges that occurrence (omit/complete/modify overrides). Omit for the stored item / non-occurrence detail.";
            return operation;
        });

    public static RouteHandlerBuilder WithCalendarItemDeleteInstanceDocs(this RouteHandlerBuilder builder) =>
        builder.WithOpenApi(operation =>
        {
            operation.Summary = "Delete recurrence exception for one occurrence";
            operation.Description =
                "Removes the `CalendarRecurrenceExceptions` row for the canonical slot (clears hide-this-day, complete-this-day, or per-day edits). " +
                "**Query `instanceStartUtc`** (required): same UTC key as list/range rows and GET detail, e.g. `2026-04-16T09:00:00Z`. Undo can restore the deleted row.";
            return operation;
        });
}
