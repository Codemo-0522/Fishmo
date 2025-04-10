import pymysql
from codes import config
import json

# 数据库连接和操作
class Connect_mysql:
    def __init__(self):
        self.host = config.mysql_host
        self.port = config.mysql_port
        self.user = config.mysql_user
        self.password = config.mysql_password
        self.database = config.mysql_database
        self.charset = config.mysql_charset

    # 数据库连接
    def connect(self):
        try:
            return pymysql.connect(host=self.host, port=self.port, user=self.user,
                                   passwd=self.password, db=self.database, charset=self.charset)
        except Exception as e:
            return json.dumps({'error': "数据库连接失败"}, ensure_ascii=False)

    # 查询多条记录
    def fetch_all_records(self, SQL):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL)
                    result = cursor.fetchall()
            return result
        except Exception as e:
            return {'error': "数据库查询失败"}

    # 查询单条记录
    def fetch_one_record(self, SQL,params=None):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL,params)
            return cursor.fetchone()
        except Exception as e:
            return {'error': "数据库查询失败"}

    def alter_data(self, SQL, params=None):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL, params)
                    db.commit()  # 手动提交事务
                return cursor.rowcount  # 返回受影响的行数
        except Exception as e:
            db.rollback()  # 出现异常时回滚事务
            return json.dumps({'error': "数据库更新失败"}, ensure_ascii=False)

if __name__ == '__main__':
    mysql_conn = Connect_mysql()



