"""SQL bodies shared between migrations and their tests.

Kept under ``src`` (rather than inside ``alembic/versions``) because that is
what ``alembic.ini`` puts on ``sys.path``, and because the repository's
file-size limit applies to migration modules too.
"""
