import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import MetaTrader5 as mt5
import requests

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
BATCH_SIZE = 200
DEFAULT_POLL_SECONDS = 10


def stop(message, code=1):
    print(f"\nCheetrade sync: {message}")
    mt5.shutdown()
    sys.exit(code)


if not CONFIG_PATH.exists():
    stop("config.json is missing. Download it from Cheetrade Desktop sync and place it beside this file.")

config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
import_url = config.get("import_url")
import_token = config.get("import_token")
poll_seconds = max(5, int(config.get("poll_seconds", DEFAULT_POLL_SECONDS)))
run_once = bool(config.get("run_once", False))
if not import_url or not import_token:
    stop("config.json needs import_url and import_token.")

if not mt5.initialize():
    stop(f"Could not connect to the open MT5 desktop app: {mt5.last_error()}")

account = mt5.account_info()
if account is None:
    stop("MT5 is open but not signed in. Sign in, then run this again.")

closed_entries = {mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT}
trade_types = {mt5.DEAL_TYPE_BUY: "long", mt5.DEAL_TYPE_SELL: "short"}
position_types = {mt5.POSITION_TYPE_BUY: "long", mt5.POSITION_TYPE_SELL: "short"}
headers = {"content-type": "application/json", "x-cheetrade-import-token": import_token}


def closed_deals(since):
    history = mt5.history_deals_get(since, datetime.now(timezone.utc))
    if history is None:
        raise RuntimeError(f"Could not read MT5 history: {mt5.last_error()}")
    return [
        {
            "ticket": str(deal.ticket),
            "positionId": str(deal.position_id),
            "symbol": deal.symbol,
            "side": trade_types[deal.type],
            "volume": deal.volume,
            "price": deal.price,
            "profit": deal.profit,
            "commission": deal.commission,
            "swap": deal.swap,
            "fee": deal.fee,
            "occurredAt": datetime.fromtimestamp(deal.time, timezone.utc).isoformat(),
            "raw": {"order": str(deal.order), "magic": deal.magic, "reason": deal.reason, "comment": deal.comment},
        }
        for deal in history
        if deal.entry in closed_entries and deal.type in trade_types
    ]


def open_positions():
    positions = mt5.positions_get()
    if positions is None:
        raise RuntimeError(f"Could not read open MT5 positions: {mt5.last_error()}")
    return [
        {
            "ticket": str(position.ticket),
            "symbol": position.symbol,
            "side": position_types[position.type],
            "volume": position.volume,
            "openPrice": position.price_open,
            "currentPrice": position.price_current,
            "stopLoss": position.sl,
            "takeProfit": position.tp,
            "profit": position.profit,
            "swap": position.swap,
            "openedAt": datetime.fromtimestamp(position.time, timezone.utc).isoformat(),
        }
        for position in positions
        if position.type in position_types
    ]


def account_snapshot():
    current = mt5.account_info()
    if current is None:
        raise RuntimeError("MT5 disconnected from the trading account.")
    return {
        "balance": current.balance,
        "equity": current.equity,
        "margin": current.margin,
        "freeMargin": current.margin_free,
        "currency": current.currency,
        "server": current.server,
    }


def upload(since):
    deals = closed_deals(since)
    positions = open_positions()
    snapshot = account_snapshot()
    batches = [deals[index:index + BATCH_SIZE] for index in range(0, len(deals), BATCH_SIZE)] or [[]]
    imported = 0
    for index, batch in enumerate(batches):
        payload = {"accountNumber": str(account.login), "deals": batch}
        if index == 0:
            payload.update({"positions": positions, "account": snapshot})
        response = requests.post(import_url, headers=headers, json=payload, timeout=30)
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        if not response.ok:
            raise RuntimeError(body.get("error", f"Upload failed with status {response.status_code}"))
        imported += body.get("imported", 0)
    return imported, len(positions), snapshot


print(f"Cheetrade live sync connected to {account.server} account {account.login}.")
print(f"Watching every {poll_seconds} seconds. Keep this window and XM MT5 open. Press Ctrl+C to stop.")

first_sync = True
try:
    while True:
        try:
            since = datetime.now(timezone.utc) - timedelta(days=3650 if first_sync else 7)
            imported, position_count, snapshot = upload(since)
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] synced {imported} closed deals · {position_count} open positions · equity {snapshot['equity']:.2f} {snapshot['currency']}")
            first_sync = False
            if run_once:
                break
            time.sleep(poll_seconds)
        except (requests.RequestException, RuntimeError) as error:
            print(f"Cheetrade sync warning: {error}. Retrying in {poll_seconds} seconds.")
            if run_once:
                raise
            time.sleep(poll_seconds)
except KeyboardInterrupt:
    print("\nCheetrade live sync stopped.")
finally:
    mt5.shutdown()
