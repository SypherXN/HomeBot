using Xunit;

namespace HomeBot.Tests;

public sealed class ValidationHelperTests
{
    [Theory]
    [InlineData("")]
    [InlineData("daily")]
    [InlineData("weekly")]
    [InlineData("monthly")]
    [InlineData("yearly")]
    [InlineData("annual")]
    public void ValidateRecurrence_accepts_supported_values(string input)
    {
        Assert.True(ValidationHelper.ValidateRecurrence(input, out var error));
        Assert.Equal("", error);
    }

    [Fact]
    public void ValidateRecurrence_rejects_unknown_token()
    {
        Assert.False(ValidationHelper.ValidateRecurrence("biweekly", out var error));
        Assert.Contains("yearly", error);
    }

    [Theory]
    [InlineData("annual", "yearly")]
    [InlineData("YEARLY", "yearly")]
    [InlineData(" monthly ", "monthly")]
    [InlineData("", "")]
    public void NormalizeRecurrence_maps_client_tokens(string input, string expected)
    {
        Assert.Equal(expected, ValidationHelper.NormalizeRecurrence(input));
    }
}
