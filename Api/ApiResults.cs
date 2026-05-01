using Microsoft.AspNetCore.Http;

/// <summary>
/// Typed API results with consistent error JSON (<see cref="ApiErrorBody"/>).
/// </summary>
public static class ApiResults
{
    public static IResult BadRequest(string message, string code = "bad_request") =>
        Results.BadRequest(new ApiErrorBody(message, code));

    public static IResult NotFound(string message, string code = "not_found") =>
        Results.Json(new ApiErrorBody(message, code), statusCode: StatusCodes.Status404NotFound);

    public static IResult Conflict(string message, string code = "conflict") =>
        Results.Json(new ApiErrorBody(message, code), statusCode: StatusCodes.Status409Conflict);

    public static IResult Validation(string message) =>
        BadRequest(message, "validation_error");
}
