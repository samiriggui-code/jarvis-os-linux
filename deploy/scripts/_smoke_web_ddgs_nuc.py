#!/usr/bin/env python3
from tools.web_tools import web_search_tool

result = web_search_tool("meteo Paris aujourd'hui", limit=2)
print(result[:600])
