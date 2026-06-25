#!/usr/bin/env python3
"""Echo tool — 回显输入参数，用于测试 skill 框架合约。"""
import json
import sys


def main():
    try:
        raw = sys.stdin.read()
        if not raw:
            output = {"success": False, "error": "no input"}
            json.dump(output, sys.stdout)
            return

        input_data = json.loads(raw)
        args = input_data.get("args", {})
        message = args.get("message", "hello")

        output = {
            "success": True,
            "result": {
                "echo": message,
                "received_args": args,
                "skill_dir": input_data.get("skill_dir", ""),
            },
        }
        json.dump(output, sys.stdout, ensure_ascii=False)
    except Exception as e:
        json.dump({"success": False, "error": str(e)}, sys.stdout)


if __name__ == "__main__":
    main()
