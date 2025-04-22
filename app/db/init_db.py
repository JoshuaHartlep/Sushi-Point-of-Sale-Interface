from app.db.database import engine
from app.models.menu import Base as MenuBase
from app.models.order import Base as OrderBase

def init_db():
    MenuBase.metadata.create_all(bind=engine)
    OrderBase.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db() 