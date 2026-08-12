export const page = (): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>biz-demo funnel</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0 auto; padding: 1.5rem; max-width: 30rem; }
  fieldset { border: 1px solid currentColor; border-radius: .5rem; margin: 0 0 1rem; }
  label { display: block; margin: .5rem 0 .25rem; }
  input, select, button { font: inherit; width: 100%; padding: .6rem; box-sizing: border-box; }
  button { margin-top: .75rem; cursor: pointer; }
  dl { display: grid; grid-template-columns: 1fr auto; gap: .35rem 1rem; margin: 0; }
  dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
  #error:empty { display: none; }
  #error { margin-top: .75rem; }
</style>
</head>
<body>
<h1>Sales funnel</h1>

<fieldset>
  <legend>Record an event</legend>
  <label for="name">Event</label>
  <select id="name">
    <option value="lead.created">Lead created</option>
    <option value="lead.qualified">Lead qualified</option>
    <option value="deal.won">Deal won</option>
  </select>

  <label for="leadId">Lead</label>
  <input id="leadId" value="a">

  <label for="amountCents">Amount (cents)</label>
  <input id="amountCents" type="number" value="50000">

  <button id="record">Record</button>
  <p id="error" role="alert"></p>
</fieldset>

<fieldset>
  <legend>Stats</legend>
  <dl>
    <dt>Leads created</dt><dd id="leadsCreated">0</dd>
    <dt>Leads qualified</dt><dd id="leadsQualified">0</dd>
    <dt>Deals won</dt><dd id="dealsWon">0</dd>
    <dt>Qualification rate</dt><dd id="qualificationRate">0</dd>
    <dt>Win rate</dt><dd id="winRate">0</dd>
    <dt>Revenue (cents)</dt><dd id="revenueCents">0</dd>
  </dl>
</fieldset>

<script>
  const el = (id) => document.getElementById(id)

  const refresh = async () => {
    const stats = await (await fetch('/stats')).json()
    for (const [key, value] of Object.entries(stats)) {
      if (el(key)) el(key).textContent = String(value)
    }
  }

  el('record').addEventListener('click', async () => {
    el('error').textContent = ''
    const name = el('name').value
    const body = { name, leadId: el('leadId').value }
    if (name === 'deal.won') body.amountCents = Number(el('amountCents').value)

    const response = await fetch('/events', { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) {
      el('error').textContent = 'Rejected: ' + (await response.json()).error
      return
    }
    await refresh()
  })

  refresh()
</script>
</body>
</html>
`
