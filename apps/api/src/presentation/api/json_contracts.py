from typing_extensions import TypeAliasType

JsonDocument = TypeAliasType(
    "JsonDocument",
    "dict[str, JsonDocument] | list[JsonDocument] | str | int | float | bool | None",
)
