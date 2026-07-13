import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import MetaTrader5 as mt5
import requests

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
BATCH_SIZE = 200


def fail(message):
    print(f"\nCheetrade sync: {message}")
    mt5.shutdown()
    sys.exit(1)


if not CONFIG_PATH.exists():
    fail("config.json is missing. Download it from Cheetrade Desktop sync and place it beside this file.")

config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
import_url = config.get("import_url")
import_token = config.get("import_token")
if not import_url or not import_token:
    fail("config.json needs import_url and import_token.")

if not mt5.initialize():
    fail(f"Could not connect to the open MT5 desktop app: {mt5.last_error()}")

account = mt5.account_info()
if account is None:
    fail("MT5 is open but not signed in. Sign in, then run this again.")

deals = mt5.history_deals_get(datetime.now(timezone.utc) - timedelta(days=3650), datetime.now(timezone.utc))
if deals is None:
    fail(f"Could not read MT5 history: {mt5.last_error()}")

closed_entries = {mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT}
trade_types = {mt5.DEAL_TYPE_BUY: "long", mt5.DEAL_TYPE_SELL: "short"}
payload_deals = []
for deal in deals:
    if deal.entry not in closed_entries or deal.type not in trade_types:
        continue
    payload_deals.append({
        "ticket": str(deal.ticket), "positionId": str(deal.position_id), "symbol": deal.symbol, "side": trade_types[deal.type],
        "volume": deal.volume, "price": deal.price, "profit": deal.profit, "commission": deal.commission, "swap": deal.swap, "fee": deal.fee,
        "occurredAt": datetime.fromtimestamp(deal.time, timezone.utc).isoformat(),
        "raw": {"order": str(deal.order), "magic": deal.magic, "reason": deal.reason, "comment": deal.comment},
    })

if not payload_deals:
    print("Cheetrade sync: no closed buy/sell deals found yet.")
    mt5.shutdown()
    sys.exit(0)

headers = {"content-type": "application/json", "x-cheetrade-import-token": import_token}
total = 0
for start in range(0, len(payload_deals), BATCH_SIZE):
    response = requests.post(import_url, headers=headers, json={"accountNumber": str(account.login), "deals": payload_deals[start:start + BATCH_SIZE]}, timeout=30)
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if not response.ok:
        fail(body.get("error", f"Upload failed with status {response.status_code}"))
    total += body.get("imported", 0)

mt5.shutdown()
print(f"Cheetrade sync complete: {total} closed MT5 deals imported.")
