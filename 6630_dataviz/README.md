\# NFL Viz — Milestone Prototype (Schema‑aligned)





This prototype reads your CSVs from `data/playerdata.csv` and `data/teamdata.csv` and renders:

\- \*\*Home / League\*\* page with conference/division pills, metric/season/position filters, and a ranked \*\*players table\*\*.

\- \*\*Player\*\* page with headshot, general info, metric tabs, and a weekly line chart.

\- \*\*Team\*\* page with division info and a weekly aggregate line chart.





Run locally:



python -m http.server 8000



Deploy: GitHub Pages → Deploy from branch → root.





Note: The \*\*Record\*\* column is a placeholder since wins/losses aren’t present in the provided schema. If you add a record dataset later, a simple join on `team+season` will populate it.

