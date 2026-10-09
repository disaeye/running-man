async def route(cursor: object) -> None:
    query = "SELECT athlete_id FROM athletes"
    await cursor.execute(query)
