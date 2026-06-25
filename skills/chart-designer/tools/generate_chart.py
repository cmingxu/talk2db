#!/usr/bin/env python3
"""
generate_chart.py — Generate interactive ECharts HTML from structured data.

Input (stdin JSON):
{
    "args": {
        "chart_type": "bar",
        "title": "月度销售额",
        "data": {
            "labels": ["1月", "2月", "3月"],
            "series": [
                {"name": "产品A", "values": [120, 200, 150]},
                {"name": "产品B", "values": [90, 180, 210]}
            ]
        }
    },
    "skill_dir": "/path/to/skills/chart-designer"
}

Output (stdout JSON):
{"success": true, "result": {"type": "html", "html": "<div>...</div>"}}
"""

import json
import sys
from textwrap import dedent


# ── ECharts series type mapping ──────────────────────────────────────

SERIES_TYPE = {
    "bar":        "bar",
    "line":       "line",
    "pie":        "pie",
    "scatter":    "scatter",
    "bar-stack":  "bar",
    "area":       "line",
}

# Extra options applied per chart type
EXTRA_OPTIONS = {
    "bar-stack": lambda _: {"stack": "total"},
    "area":      lambda _: {"areaStyle": {}},
}


def validate_input(args: dict) -> tuple[str, str, list, list]:
    """Validate and extract chart parameters. Returns (chart_type, title, labels, series)."""
    chart_type = args.get("chart_type", "")
    if chart_type not in SERIES_TYPE:
        valid = ", ".join(SERIES_TYPE.keys())
        raise ValueError(f"不支持的图表类型 '{chart_type}'，可选: {valid}")

    title = args.get("title", "").strip()
    if not title:
        raise ValueError("图表标题不能为空")

    data = args.get("data")
    if not isinstance(data, dict):
        raise ValueError("data 必须是对象 {labels: [...], series: [...]}")

    labels = data.get("labels")
    series_list = data.get("series")

    if not isinstance(labels, list) or len(labels) == 0:
        raise ValueError("data.labels 必须是非空数组")
    if not isinstance(series_list, list) or len(series_list) == 0:
        raise ValueError("data.series 必须是非空数组")

    # Pie chart: only first series matters
    if chart_type == "pie":
        series_list = series_list[:1]

    for i, s in enumerate(series_list):
        if not isinstance(s, dict):
            raise ValueError(f"series[{i}] 必须是对象")
        if "name" not in s:
            s["name"] = f"系列{i+1}"
        if not isinstance(s.get("values"), list) or len(s["values"]) == 0:
            raise ValueError(f"series[{i}].values 必须是非空数组")
        if len(s["values"]) != len(labels):
            raise ValueError(
                f"series[{i}] ('{s['name']}') 的 values 长度 ({len(s['values'])}) "
                f"与 labels 长度 ({len(labels)}) 不一致"
            )

    return chart_type, title, labels, series_list


def build_echarts_option(chart_type: str, title: str, labels: list, series_list: list) -> dict:
    """Build the ECharts option object."""
    echarts_type = SERIES_TYPE[chart_type]
    extra_fn = EXTRA_OPTIONS.get(chart_type)

    series = []
    for s in series_list:
        item = {
            "name": s["name"],
            "type": echarts_type,
            "data": s["values"],
        }
        if extra_fn:
            item.update(extra_fn(s))
        series.append(item)

    option = {
        "title": {
            "text": title,
            "left": "center",
            "textStyle": {"fontSize": 16},
        },
        "tooltip": {
            "trigger": "axis" if chart_type != "pie" else "item",
        },
        "legend": {
            "bottom": 5,
            "type": "scroll",
        },
        "grid": {
            "left": "3%",
            "right": "4%",
            "bottom": "12%",
            "containLabel": True,
        },
        "xAxis": {
            "type": "category",
            "data": labels,
            "axisLabel": {"rotate": len(labels) > 6 and 30 or 0},
        },
        "yAxis": {
            "type": "value",
        },
        "series": series,
    }

    # Pie chart: different axis config
    if chart_type == "pie":
        del option["xAxis"]
        del option["yAxis"]
        del option["grid"]
        option["series"][0]["radius"] = "60%"
        option["series"][0]["center"] = ["50%", "50%"]
        option["series"][0]["label"] = {"formatter": "{b}: {c} ({d}%)"}

    # Scatter: no category axis
    if chart_type == "scatter":
        option["xAxis"] = {"type": "value"}
        # Convert scatter values to [x, y] pairs
        # When labels is numeric, pair with series values
        for item in series:
            xs = [float(x) for x in labels]
            ys = [float(y) for y in item["data"]]
            item["data"] = [[xs[i], ys[i]] for i in range(len(xs))]

    return option


def build_html(option: dict) -> str:
    """Generate a self-contained HTML page with ECharts."""
    option_json = json.dumps(option, ensure_ascii=False, indent=2)

    return dedent(f"""\
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
      #chart {{ width: 100%; height: 100vh; }}
    </style>
    </head>
    <body>
    <div id="chart"></div>
    <script>
      var chart = echarts.init(document.getElementById('chart'));
      chart.setOption({option_json});
      window.addEventListener('resize', function() {{ chart.resize(); }});
    </script>
    </body>
    </html>""")


def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            output = {"success": False, "error": "无输入数据"}
            json.dump(output, sys.stdout, ensure_ascii=False)
            return

        input_data = json.loads(raw)
        args = input_data.get("args", {})
        if not isinstance(args, dict):
            args = {}

        # Validate
        chart_type, title, labels, series_list = validate_input(args)

        # Build
        option = build_echarts_option(chart_type, title, labels, series_list)
        html = build_html(option)

        output = {
            "success": True,
            "result": {
                "type": "html",
                "html": html,
                "chart_type": chart_type,
                "title": title,
            },
        }
        json.dump(output, sys.stdout, ensure_ascii=False)

    except ValueError as e:
        json.dump({"success": False, "error": str(e)}, sys.stdout, ensure_ascii=False)
    except Exception as e:
        json.dump({"success": False, "error": f"脚本执行错误: {e}"}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
