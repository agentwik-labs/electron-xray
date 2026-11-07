// OUR TEST FIXTURE (planted twin). Renderer.
document.getElementById("n").value = "hello";
fetch("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST", { method: "POST", body: JSON.stringify({ events: [{ name: "open" }] }) });
