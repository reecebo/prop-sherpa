using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using PropSherpa.Api.Features.Odds;
using PropSherpa.Api.Features.Players;
using PropSherpa.Api.Integrations.SportsGameOdds;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
var configuration = builder.Configuration;

builder.Services.Configure<SportsGameOddsOptions>(configuration.GetSection("SportsGameOdds"));

builder.Services.AddHttpClient<ISportsGameOddsClient, SportsGameOddsClient>((sp, client) =>
{
    var opts = sp.GetRequiredService<IOptions<SportsGameOddsOptions>>().Value;

    client.BaseAddress = new Uri(opts.BaseUrl);

    if (!string.IsNullOrWhiteSpace(opts.ApiKey))
    {
        client.DefaultRequestHeaders.Add("X-API-Key", opts.ApiKey);
    }
});

builder.Services.AddOpenApi();


var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.MapGet("/api/health", () => "PropSherpa API is alive!");

app.MapPlayersEndpoints();
app.MapOddsEndpoints();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
