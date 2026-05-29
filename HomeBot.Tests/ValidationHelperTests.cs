using Xunit;

namespace HomeBot.Tests;

public sealed class ValidationHelperTests
{
    [Theory]
    [InlineData("")]
    [InlineData("daily")]
    [InlineData("weekly")]
    [InlineData("monthly")]
    public void ValidateRecurrence_accepts_supported_values(string input)
    {
        Assert.True(ValidationHelper.ValidateRecurrence(input, out var error));
        Assert.Equal("", error);
    }

    [Fact]
    public void ValidateRecurrence_rejects_unknown_token()
    {
        Assert.False(ValidationHelper.ValidateRecurrence("yearly", out var error));
        Assert.Contains("monthly", error);
    }
}
