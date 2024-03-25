# 1. 背景介绍

> 有一个写好的项目，现在需要加一点点权限控制，本来呢需要在`xml`里一个一个的加上相应的查询条件，
>
> 不想那么费劲自定义了个注解，但是呢还是要在每个Mapper里边加上注解

# 2. 实现思路

> 首先来一个自定义注解，在`Mybatis`自定义拦截器当中使用，通过判断当前的`sql`语句是`SELECT`语句时动态拼接权限控制语句

## 1. 自定义注解

> 这个注解包含关联的表名，别名，权限字段等
>
> 最终实现在`where`条件最后拼接下列语句
>
> ```sql
> select * 
> from tb_user user
> where user.delete_flag =false
> -- 以下为注解添加的sql
> and user.dept_id in (xxx)
> ```
>
> 我这个获取参数用的是参数在方法中的位置获取的，
>
> 也可以添加一个`paramName`来获取，也就是`@Param(xxx)`里边的这个xxx, 
>
> 在后续拦截器`)parameterHandler.getParameterObject()`获取的Map参数中会有别名对应和下标对应的两种形式
>
> 如一个方法
>
> ```java
> List<User> getUserList(Page page,)
> ```
>
> 

```java
import java.lang.annotation.*;


@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface PermissionControl {

    /**
     * 要关联的表名
     * @return String
     */
    String tableName() default "" ;

    /**
     * 表的别名
     * @return  String
     */
    String tableAlias() default "";

    /**
     * 关联的字段名
     * @return  String
     */
    String columnName() default "id";

    /**
     * 字段名称
     * @return  String
     */
    String fieldName() default "id";

    /**
     * 参数的下标，从2开始，一般的分页查询查询条件都是从第二个开始的
     * @return int
     */
    int paramIndex() default 2;
}

```

## 2. 创建Mybatis拦截器(第一版)

> 这个版本存在一些问题，虽然能够成功的在最后加上了条件，但是使用了`IPage`这个`Mybatis-plus分页插件`的方法，会导致分页的`Total`和`Pages`数据不对，问题在于`Mybatis-plus分页插件`这个拦截器的执行顺序在自定义拦截器之前，所以导致分页查询条数的时候还没有根据注解添加条件

```java
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.druid.sql.ast.SQLExpr;
import com.alibaba.druid.sql.ast.SQLStatement;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOpExpr;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOperator;
import com.alibaba.druid.sql.ast.statement.SQLSelect;
import com.alibaba.druid.sql.ast.statement.SQLSelectQueryBlock;
import com.alibaba.druid.sql.ast.statement.SQLSelectStatement;
import com.alibaba.druid.sql.parser.SQLExprParser;
import com.alibaba.druid.sql.parser.SQLParserUtils;
import com.alibaba.druid.sql.parser.SQLStatementParser;
import com.alibaba.druid.util.JdbcUtils;
import com.baomidou.mybatisplus.core.MybatisDefaultParameterHandler;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.reflection.SystemMetaObject;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.type.TypeHandlerRegistry;
import org.springframework.core.annotation.Order;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Matcher;


// 在sql预处理阶段拦截
@Intercepts({@Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})})
@Slf4j
@Component
public class PermissionControlInterceptor implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
		
        StatementHandler statementHandler = (StatementHandler) invocation.getTarget();
        MetaObject metaObject = SystemMetaObject.forObject(statementHandler);
        // 获取当前要执行的sql
        BoundSql boundSql = (BoundSql) metaObject.getValue("delegate.boundSql");
        MappedStatement mappedStatement = (MappedStatement) metaObject.getValue("delegate.mappedStatement");
        MybatisDefaultParameterHandler parameterHandler = (MybatisDefaultParameterHandler) metaObject.getValue("delegate.parameterHandler");
        Map<String, Object> paramMap = (Map)parameterHandler.getParameterObject();
        SqlCommandType sqlCommandType = mappedStatement.getSqlCommandType();
        //id为执行的mapper方法的全路径名，如com.xxx.xxxMapper.insertXxx
        String sqlId = mappedStatement.getId();
        //获取节点的配置
        Configuration configuration = mappedStatement.getConfiguration();
        //获取最终的sql语句
        String sql = getSql(configuration, boundSql, sqlId, false);
        PermissionControl permissionControl = getAnnotation(sqlId);
        // 非select语句或者方法上没有权限控制注解的返回执行结果
        if (!SqlCommandType.SELECT.equals(sqlCommandType) || permissionControl == null) {
            return proceed(invocation, sqlId, sql);
         }
        // 获取处理之前的sql
        String beforeSql = boundSql.getSql().replaceAll("[\\s]+", " ");
        log.info("之前的sql {}", beforeSql);
        // 处理sql拼接对应的where条件
        String afterSql = contactConditions(beforeSql, permissionControl, paramMap);
        log.info("权限控制之后的sql {}", afterSql);
        // 使用反射变更boundSql中要执行的sql，这个属性是private的需要用反射改成public才能更改
        ReflectUtil.setFieldValue(boundSql, "sql", afterSql);
        log.info("最终执行的sql {}", getSql(configuration, boundSql, sqlId, false));
        return proceed(invocation, sqlId, sql);
    }

    private Object proceed(Invocation invocation, String sqlId, String sql) throws Throwable{
        try {
            //执行完上面的任务后，执行原有sql的执行过程
            return invocation.proceed();
        } catch (InvocationTargetException e) {
            log.error("当前sql执行错误\n {} \n, 方法id ::: {}\n 执行sql ::: {}", e.getMessage(), sqlId, sql);
            log.error("sql执行异常", e);
            throw new RuntimeException("sql执行异常" + sqlId);
        }
    }

    /**
     * 获取Mapper类上带有自定义注解{@link PermissionControl}的方法
     * 类上有{@link PermissionControl}注解的 方法上没有的话返回类上的
     * 类上和方法上都有 {@link PermissionControl} 注解的话用方法上的
     *
     * @param sqlId mapper方法的全路径名
     * @return PermissionControl
     */
    private PermissionControl getAnnotation(String sqlId) {
        PermissionControl permissionControl = null;
        try {
            //通过执行方法全路径获取Class对象
            Class<?> classType = Class.forName(sqlId.substring(0, sqlId.lastIndexOf(".")));
            // 如果类上有@PermissionControl注解的话直接返回
            permissionControl = classType.getAnnotation(PermissionControl.class);
            //获取当前截取的方法名称
            String methodName = sqlId.substring(sqlId.lastIndexOf(".") + 1);
            // 遍历类中所有方法名称，并if匹配上当前所拦截的方法
            for (Method method : classType.getDeclaredMethods()) {
                if (StrUtil.equals(methodName, method.getName())) {
                    // 判断方法上是否带有自定义@PermissionControl注解
                    return method.getAnnotation(PermissionControl.class);
                }
            }
        } catch (ClassNotFoundException e) {
            log.error("ClassNotFoundException！", e);
        }
        return permissionControl;
    }
	 /**
     * 拼接where条件
     * @param sql                       原来的boundSql
     * @param permissionControl         注解标注的内容
     * @param paramMap                  mapper自带的参数
     * @return 返回拼接好的sql语句
     */
    private static String contactConditions(String sql, PermissionControl permissionControl, Map<String, Object> paramMap) {
        SQLStatementParser parser = SQLParserUtils.createSQLStatementParser(sql, JdbcUtils.POSTGRESQL);
        List<SQLStatement> stmtList = parser.parseStatementList();
        SQLStatement stmt = stmtList.get(0);
        if (stmt instanceof SQLSelectStatement) {
            StringBuffer constraintsBuffer = new StringBuffer();
            String tableAlias = permissionControl.tableAlias();
            if (StrUtil.isBlank(tableAlias)) {
                tableAlias = permissionControl.tableName();
            }
            String columnName = permissionControl.columnName();
            String paramIndex = "param" + permissionControl.paramIndex();
            Object param = paramMap.get(paramIndex);
            Object fieldValue = ReflectUtil.getFieldValue(param, permissionControl.fieldName());
            if (fieldValue == null) {
                return sql;
            }
            if (StrUtil.isNotBlank(tableAlias) && StrUtil.isNotBlank(columnName)) {
                String str = StrUtil.format("{}.{} in (xxx))",
                        tableAlias, columnName, String.valueOf(fieldValue));
                constraintsBuffer.append(str);
            }

            SQLExprParser constraintsParser = SQLParserUtils.createExprParser(constraintsBuffer.toString(), JdbcUtils.POSTGRESQL);
            SQLExpr constraintsExpr = constraintsParser.expr();

            SQLSelectStatement selectStmt = (SQLSelectStatement) stmt;
            // 拿到SQLSelect
            SQLSelect sqlselect = selectStmt.getSelect();
            SQLSelectQueryBlock query = (SQLSelectQueryBlock) sqlselect.getQuery();
            SQLExpr whereExpr = query.getWhere();
            // 修改where表达式
            if (whereExpr == null) {
                query.setWhere(constraintsExpr);
            } else {
                SQLBinaryOpExpr newWhereExpr = new SQLBinaryOpExpr(whereExpr, SQLBinaryOperator.BooleanAnd, constraintsExpr);
                query.setWhere(newWhereExpr);
            }
            sqlselect.setQuery(query);
            return sqlselect.toString();

        }

        return sql;
    }


    /**
     * 获取最终的sql语句
     *
     * @param configuration 节点配置
     * @param boundSql      BoundSql
     * @param sqlId         mapper方法的全路径名
     * @param flag          是否需要拼接mapper方法的全路径名
     * @return String
     */
    private String getSql(Configuration configuration, BoundSql boundSql, String sqlId, boolean flag) throws NoSuchFieldException {
        String sql = showSql(configuration, boundSql);
        return flag ? sqlId + ":" + sql : sql;
    }


    /**
     * 进行？的替换
     *
     * @param configuration 节点的配置
     * @param boundSql      BoundSql
     * @return String
     */
    private String showSql(Configuration configuration, BoundSql boundSql) {
        //获取参数
        Object parameterObject = boundSql.getParameterObject();
        List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
        //sql语句
        String sql = boundSql.getSql().replaceAll("[\\s]+", " ");
        if (CollUtil.isNotEmpty(parameterMappings) && parameterObject != null) {
            //获取类型处理器
            TypeHandlerRegistry typeHandlerRegistry = configuration.getTypeHandlerRegistry();
            //对应的类型则进行替换
            if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
                sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(parameterObject)));
            } else {
                MetaObject metaObject = configuration.newMetaObject(parameterObject);
                for (ParameterMapping parameterMapping : parameterMappings) {
                    String propertyName = parameterMapping.getProperty();
                    if (metaObject.hasGetter(propertyName)) {
                        Object objectValue = metaObject.getValue(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(objectValue)));
                    }
                    if (boundSql.hasAdditionalParameter(propertyName)) {
                        //动态sql
                        Object additionalParameter = boundSql.getAdditionalParameter(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(additionalParameter)));
                    }
                    //else {
                    //    sql = sql.replaceFirst("\\?", "");
                    //}
                }
            }
        }
        return sql;
    }

    /**
     * 参数二次处理
     *
     * @param parameterObject parameterObject
     * @return String
     */
    private String getParameterValue(Object parameterObject) {
        String format = "'%s'";
        String value = "";
        if (null != parameterObject) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof String) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof Date) {
            //DateFormat dateTimeInstance = DateFormat.getDateTimeInstance(DateFormat.DEFAULT, DateFormat.DEFAULT,
            // Locale.CHINA);
            //value = dateTimeInstance.format(parameterObject);
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            value = sdf.format((Date) parameterObject);
        }
        if (parameterObject instanceof LocalDateTime) {
            value = ((LocalDateTime) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        }
        if (parameterObject instanceof LocalDate) {
            value = ((LocalDate) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        }
        if (parameterObject instanceof LocalTime) {
            value = ((LocalTime) parameterObject).format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        }
        if (parameterObject instanceof Timestamp) {
            value = ((Timestamp) parameterObject).toString();
        }
        return String.format(format, value);
    }

    @Override
    public Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }

    @Override
    public void setProperties(Properties properties) {
        Interceptor.super.setProperties(properties);
    }
}
```

为了解决分页插件在自定义拦截器前执行的这个问题，选择使用`@Order`注解来变更这两个`Bean`的加载顺序

### 2.1 Round 1

- 将分页插件的调到999最后加载

```java
@Bean
@Order(999)
public PaginationInterceptor paginationInterceptor() {
    PaginationInterceptor paginationInterceptor = new PaginationInterceptor();
    paginationInterceptor.setLimit(-1);// 默认最大单页数量不受限制
    return paginationInterceptor;
}
```

- 自定义调到1最先加载

```java
@Component
@Order(1)
public class PermissionControlInterceptor implements Interceptor {}
```

这把直接没起作用，后来经过查询才知道，这玩意居然是倒着加载的参考[springboot注解 + mybatisplus拦截器实现数据权限拦截（兼容分页插件）](https://blog.csdn.net/qq_42795049/article/details/123462091)

我也没明白啥意思，在我的代码里直接就报错了，忘了是啥了

### 2.2 Round 2

- 这把直接把分页调成1

```
@Bean
@Order(1)
public PaginationInterceptor paginationInterceptor() {
    PaginationInterceptor paginationInterceptor = new PaginationInterceptor();
    paginationInterceptor.setLimit(-1);// 默认最大单页数量不受限制
    return paginationInterceptor;
}
```

- 自定义拦截器调整999

```java
@Component
@Order(1)
public class PermissionControlInterceptor implements Interceptor {}
```

到这里好玩的事情就出现了，这个自定义拦截器虽然在分页插件之前执行了，

但是!但是!!但是!!!

这个类上边的注解导致那个`BoundSql boundSql = (BoundSql) metaObject.getValue("delegate.boundSql");`获取不到了，

```java
@Intercepts({@Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})})
```

通过查询[CSDN](http://csdn.net)某文章找不到了，发现如果在分页插件之前执行，自定义插件只能用下边这个两个注解修饰，只能在query这个，

```java
@Intercepts(
    {
        @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
        @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class, CacheKey.class, BoundSql.class}),
    }
)
```

### 2.3 Round3

知道了这个，我直接吧我现有的这个类上的注解改了

新的问题又出现了，换了这个类上的注解之后，

```java
public Object intercept(Invocation invocation) throws Throwable {}
```

这个方法里`invocation`里边各种获取的方法都不一样了

## 3. 自定义拦截器(第二版)

> 这个改版之后，虽然成功解决了`prepare`和`query`变更之后`invocation`获取参数的差异，
>
> 但是，这个玩意分页是虽然能打印出来sql，但是那个反射修改`BoundSql`的方法并不会替换`invocation.proceed()`这个`invocation`里边实际执行的sql

- 分页插件

```java
@Bean
@Order(10)
public PaginationInterceptor paginationInterceptor() {
    PaginationInterceptor paginationInterceptor = new PaginationInterceptor();
    paginationInterceptor.setLimit(-1);// 默认最大单页数量不受限制
    return paginationInterceptor;
}
```

- 自定义拦截器

```java
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.druid.sql.ast.SQLExpr;
import com.alibaba.druid.sql.ast.SQLStatement;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOpExpr;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOperator;
import com.alibaba.druid.sql.ast.statement.SQLSelect;
import com.alibaba.druid.sql.ast.statement.SQLSelectQueryBlock;
import com.alibaba.druid.sql.ast.statement.SQLSelectStatement;
import com.alibaba.druid.sql.parser.SQLExprParser;
import com.alibaba.druid.sql.parser.SQLParserUtils;
import com.alibaba.druid.sql.parser.SQLStatementParser;
import com.alibaba.druid.util.JdbcUtils;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.cache.CacheKey;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.type.TypeHandlerRegistry;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Matcher;


@Intercepts(
        {
                @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
                @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class, CacheKey.class, BoundSql.class}),
        }
)
@Slf4j
@Component
@Order(20)
public class PermissionControlInterceptorV2 implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {

        Object[] args = invocation.getArgs();
        MappedStatement mappedStatement = (MappedStatement) args[0];
        SqlCommandType sqlCommandType = mappedStatement.getSqlCommandType();
        //获取参数，语句成立，表示sql语句有参数，参数格式是map形式
        Object parameter = args.length > 1 ? args[1] : null;

        //id为执行的mapper方法的全路径名，如com.xxx.xxxMapper.insertXxx
        String sqlId = mappedStatement.getId();
        Executor executor = (Executor) invocation.getTarget();
        //[BoundSql]封装mybatis最终产生的sql类
        BoundSql boundSql = mappedStatement.getBoundSql(parameter);
        //获取节点的配置
        Configuration configuration = mappedStatement.getConfiguration();
        String sql = getSql(configuration, boundSql, sqlId, false);
        PermissionControl permissionControl = getAnnotation(sqlId);
        // 非select语句直接过滤
        if (!SqlCommandType.SELECT.equals(sqlCommandType) || permissionControl == null) {
            return proceed(invocation, sqlId, sql);
        }
        String beforeSql = boundSql.getSql().replaceAll("[\\s]+", " ");
        log.info("之前的sql {}", beforeSql);
        String afterSql = contactConditions(beforeSql, permissionControl, (Map)parameter);
        log.info("权限控制之后的sql {}", afterSql);
        ReflectUtil.setFieldValue(boundSql, "sql", afterSql);
        log.info("最终执行的sql {}", getSql(configuration, boundSql, sqlId, false));
        return proceed(invocation, sqlId, sql);
    }

    private Object proceed(Invocation invocation, String sqlId, String sql) throws Throwable{
        try {
            //执行完上面的任务后，执行原有sql的执行过程
            return invocation.proceed();
        } catch (InvocationTargetException e) {
            log.error("当前sql执行错误\n {} \n, 方法id ::: {}\n 执行sql ::: {}", e.getMessage(), sqlId, sql);
            log.error("sql执行异常", e + sqlId);
            throw new RuntimeException("sql执行异常" + sqlId);
        }
    }

    /**
     * 获取Mapper类上带有自定义注解{@link PermissionControl}的方法
     * 类上有{@link PermissionControl}注解的 方法上没有的话返回类上的
     * 类上和方法上都有 {@link PermissionControl} 注解的话用方法上的
     *
     * @param sqlId mapper方法的全路径名
     * @return PermissionControl
     */
    private PermissionControl getAnnotation(String sqlId) {
        PermissionControl permissionControl = null;
        try {
            //通过执行方法全路径获取Class对象
            Class<?> classType = Class.forName(sqlId.substring(0, sqlId.lastIndexOf(".")));
            // 如果类上有@PermissionControl注解的话直接返回
            permissionControl = classType.getAnnotation(PermissionControl.class);
            //获取当前截取的方法名称
            String methodName = sqlId.substring(sqlId.lastIndexOf(".") + 1);
            // 遍历类中所有方法名称，并if匹配上当前所拦截的方法
            for (Method method : classType.getDeclaredMethods()) {
                if (StrUtil.equals(methodName, method.getName())) {
                    // 判断方法上是否带有自定义@PermissionControl注解
                    return method.getAnnotation(PermissionControl.class);
                }
            }
        } catch (ClassNotFoundException e) {
            log.error("ClassNotFoundException！", e);
        }
        return permissionControl;
    }

    private static String contactConditions(String sql, PermissionControl permissionControl, Map<String, Object> paramMap) {
        SQLStatementParser parser = SQLParserUtils.createSQLStatementParser(sql, JdbcUtils.POSTGRESQL);
        List<SQLStatement> stmtList = parser.parseStatementList();
        SQLStatement stmt = stmtList.get(0);
        if (stmt instanceof SQLSelectStatement) {
            StringBuffer constraintsBuffer = new StringBuffer();
            String tableAlias = permissionControl.tableAlias();
            if (StrUtil.isBlank(tableAlias)) {
                tableAlias = permissionControl.tableName();
            }
            String columnName = permissionControl.columnName();
            String paramIndex = "param" + permissionControl.paramIndex();
            Object param = paramMap.get(paramIndex);
            Object fieldValue = ReflectUtil.getFieldValue(param, permissionControl.fieldName());
            if (fieldValue == null) {
                return sql;
            }
            if (StrUtil.isNotBlank(tableAlias) && StrUtil.isNotBlank(columnName)) {
                String str = StrUtil.format("{}.{} in (xxx))",
                        tableAlias, columnName, String.valueOf(fieldValue));
                constraintsBuffer.append(str);
            }

            SQLExprParser constraintsParser = SQLParserUtils.createExprParser(constraintsBuffer.toString(), JdbcUtils.POSTGRESQL);
            SQLExpr constraintsExpr = constraintsParser.expr();

            SQLSelectStatement selectStmt = (SQLSelectStatement) stmt;
            // 拿到SQLSelect
            SQLSelect sqlselect = selectStmt.getSelect();
            SQLSelectQueryBlock query = (SQLSelectQueryBlock) sqlselect.getQuery();
            SQLExpr whereExpr = query.getWhere();
            // 修改where表达式
            if (whereExpr == null) {
                query.setWhere(constraintsExpr);
            } else {
                SQLBinaryOpExpr newWhereExpr = new SQLBinaryOpExpr(whereExpr, SQLBinaryOperator.BooleanAnd, constraintsExpr);
                query.setWhere(newWhereExpr);
            }
            sqlselect.setQuery(query);
            return sqlselect.toString();

        }

        return sql;
    }


    /**
     * 获取最终的sql语句
     *
     * @param configuration 节点配置
     * @param boundSql      BoundSql
     * @param sqlId         mapper方法的全路径名
     * @param flag          是否需要拼接mapper方法的全路径名
     * @return String
     */
    private String getSql(Configuration configuration, BoundSql boundSql, String sqlId, boolean flag) throws NoSuchFieldException {
        String sql = showSql(configuration, boundSql);
        return flag ? sqlId + ":" + sql : sql;
    }


    /**
     * 进行？的替换
     *
     * @param configuration 节点的配置
     * @param boundSql      BoundSql
     * @return String
     */
    private String showSql(Configuration configuration, BoundSql boundSql) {
        //获取参数
        Object parameterObject = boundSql.getParameterObject();
        List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
        //sql语句
        String sql = boundSql.getSql().replaceAll("[\\s]+", " ");
        if (CollUtil.isNotEmpty(parameterMappings) && parameterObject != null) {
            //获取类型处理器
            TypeHandlerRegistry typeHandlerRegistry = configuration.getTypeHandlerRegistry();
            //对应的类型则进行替换
            if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
                sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(parameterObject)));
            } else {
                MetaObject metaObject = configuration.newMetaObject(parameterObject);
                for (ParameterMapping parameterMapping : parameterMappings) {
                    String propertyName = parameterMapping.getProperty();
                    if (metaObject.hasGetter(propertyName)) {
                        Object objectValue = metaObject.getValue(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(objectValue)));
                    }
                    if (boundSql.hasAdditionalParameter(propertyName)) {
                        //动态sql
                        Object additionalParameter = boundSql.getAdditionalParameter(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(additionalParameter)));
                    }
                    //else {
                    //    sql = sql.replaceFirst("\\?", "");
                    //}
                }
            }
        }
        return sql;
    }

    /**
     * 参数二次处理
     *
     * @param parameterObject parameterObject
     * @return String
     */
    private String getParameterValue(Object parameterObject) {
        String format = "'%s'";
        String value = "";
        if (null != parameterObject) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof String) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof Date) {
            //DateFormat dateTimeInstance = DateFormat.getDateTimeInstance(DateFormat.DEFAULT, DateFormat.DEFAULT,
            // Locale.CHINA);
            //value = dateTimeInstance.format(parameterObject);
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            value = sdf.format((Date) parameterObject);
        }
        if (parameterObject instanceof LocalDateTime) {
            value = ((LocalDateTime) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        }
        if (parameterObject instanceof LocalDate) {
            value = ((LocalDate) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        }
        if (parameterObject instanceof LocalTime) {
            value = ((LocalTime) parameterObject).format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        }
        if (parameterObject instanceof Timestamp) {
            value = ((Timestamp) parameterObject).toString();
        }
        return String.format(format, value);
    }

    @Override
    public Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }

    @Override
    public void setProperties(Properties properties) {
        Interceptor.super.setProperties(properties);
    }
}
```

## 4. 最终版

通过查询[mybatis插件文档](https://github.com/pagehelper/Mybatis-PageHelper/blob/master/wikis/zh/Interceptor.md#4-%E6%8B%A6%E6%88%AA-query-%E6%96%B9%E6%B3%95%E7%9A%84%E8%A7%84%E8%8C%83)无意间找到一个东西,直接使用下边的语句代替`invocation.proceed()`

```java
return executor.query(ms, parameter, rowBounds, resultHandler, cacheKey, boundSql);
```

最终自定义拦截器变更为下方的样子，其中有不少冗余代码，不过我不想改了

```java
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.druid.sql.ast.SQLExpr;
import com.alibaba.druid.sql.ast.SQLStatement;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOpExpr;
import com.alibaba.druid.sql.ast.expr.SQLBinaryOperator;
import com.alibaba.druid.sql.ast.statement.SQLSelect;
import com.alibaba.druid.sql.ast.statement.SQLSelectQueryBlock;
import com.alibaba.druid.sql.ast.statement.SQLSelectStatement;
import com.alibaba.druid.sql.parser.SQLExprParser;
import com.alibaba.druid.sql.parser.SQLParserUtils;
import com.alibaba.druid.sql.parser.SQLStatementParser;
import com.alibaba.druid.util.JdbcUtils;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.cache.CacheKey;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.apache.ibatis.type.TypeHandlerRegistry;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Matcher;


@Intercepts(
        {
                @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
                @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class, CacheKey.class, BoundSql.class}),
        }
)
@Slf4j
@Component
@Order(20)
public class PermissionControlInterceptorV2 implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {

        Object[] args = invocation.getArgs();
        MappedStatement mappedStatement = (MappedStatement) args[0];
        SqlCommandType sqlCommandType = mappedStatement.getSqlCommandType();
        //获取参数，语句成立，表示sql语句有参数，参数格式是map形式
        Object parameter = args.length > 1 ? args[1] : null;

        //id为执行的mapper方法的全路径名，如com.xxx.xxxMapper.insertXxx
        String sqlId = mappedStatement.getId();
        Executor executor = (Executor) invocation.getTarget();
        //[BoundSql]封装mybatis最终产生的sql类
        BoundSql boundSql = mappedStatement.getBoundSql(parameter);
        //获取节点的配置
        Configuration configuration = mappedStatement.getConfiguration();
        String sql = getSql(configuration, boundSql, sqlId, false);
        PermissionControl permissionControl = getAnnotation(sqlId);
        // 非select语句直接过滤
        if (!SqlCommandType.SELECT.equals(sqlCommandType) || permissionControl == null) {
            return proceed(invocation, sqlId, sql);
        }
        String beforeSql = boundSql.getSql().replaceAll("[\\s]+", " ");
        log.info("之前的sql {}", beforeSql);
        String afterSql = contactConditions(beforeSql, permissionControl, (Map)parameter);
        log.info("权限控制之后的sql {}", afterSql);
        ReflectUtil.setFieldValue(boundSql, "sql", afterSql);
        log.info("最终执行的sql {}", getSql(configuration, boundSql, sqlId, false));
        MappedStatement ms = (MappedStatement) args[0];
        Object parameterObject = args[1];
        RowBounds rowBounds = (RowBounds) args[2];
        ResultHandler resultHandler = (ResultHandler) args[3];
        //可以对参数做各种处理
        CacheKey cacheKey = executor.createCacheKey(ms, parameterObject, rowBounds, boundSql);
        return executor.query(ms, parameterObject, rowBounds, resultHandler, cacheKey, boundSql);
    }

    private Object proceed(Invocation invocation, String sqlId, String sql) throws Throwable{
        try {
            //执行完上面的任务后，执行原有sql的执行过程
            return invocation.proceed();
        } catch (InvocationTargetException e) {
            log.error("当前sql执行错误\n {} \n, 方法id ::: {}\n 执行sql ::: {}", e.getMessage(), sqlId, sql);
            log.error("sql执行异常", e);
            throw new RuntimeException("sql执行异常" + sqlId);
        }
    }

    /**
     * 获取Mapper类上带有自定义注解{@link PermissionControl}的方法
     * 类上有{@link PermissionControl}注解的 方法上没有的话返回类上的
     * 类上和方法上都有 {@link PermissionControl} 注解的话用方法上的
     *
     * @param sqlId mapper方法的全路径名
     * @return PermissionControl
     */
    private PermissionControl getAnnotation(String sqlId) {
        PermissionControl permissionControl = null;
        try {
            //通过执行方法全路径获取Class对象
            Class<?> classType = Class.forName(sqlId.substring(0, sqlId.lastIndexOf(".")));
            // 如果类上有@PermissionControl注解的话直接返回
            permissionControl = classType.getAnnotation(PermissionControl.class);
            //获取当前截取的方法名称
            String methodName = sqlId.substring(sqlId.lastIndexOf(".") + 1);
            // 遍历类中所有方法名称，并if匹配上当前所拦截的方法
            for (Method method : classType.getDeclaredMethods()) {
                if (StrUtil.equals(methodName, method.getName())) {
                    // 判断方法上是否带有自定义@PermissionControl注解
                    return method.getAnnotation(PermissionControl.class);
                }
            }
        } catch (ClassNotFoundException e) {
            log.error("ClassNotFoundException！", e);
        }
        return permissionControl;
    }

    private static String contactConditions(String sql, PermissionControl permissionControl, Map<String, Object> paramMap) {
        SQLStatementParser parser = SQLParserUtils.createSQLStatementParser(sql, JdbcUtils.POSTGRESQL);
        List<SQLStatement> stmtList = parser.parseStatementList();
        SQLStatement stmt = stmtList.get(0);
        if (stmt instanceof SQLSelectStatement) {
            StringBuffer constraintsBuffer = new StringBuffer();
            String tableAlias = permissionControl.tableAlias();
            if (StrUtil.isBlank(tableAlias)) {
                tableAlias = permissionControl.tableName();
            }
            String columnName = permissionControl.columnName();
            String paramIndex = "param" + permissionControl.paramIndex();
            Object param = paramMap.get(paramIndex);
            Object fieldValue = ReflectUtil.getFieldValue(param, permissionControl.fieldName());
            if (fieldValue == null) {
                return sql;
            }
            if (StrUtil.isNotBlank(tableAlias) && StrUtil.isNotBlank(columnName)) {
                String str = StrUtil.format("{}.{} in (xxx))",
                        tableAlias, columnName, String.valueOf(fieldValue));
                constraintsBuffer.append(str);
            }

            SQLExprParser constraintsParser = SQLParserUtils.createExprParser(constraintsBuffer.toString(), JdbcUtils.POSTGRESQL);
            SQLExpr constraintsExpr = constraintsParser.expr();

            SQLSelectStatement selectStmt = (SQLSelectStatement) stmt;
            // 拿到SQLSelect
            SQLSelect sqlselect = selectStmt.getSelect();
            SQLSelectQueryBlock query = (SQLSelectQueryBlock) sqlselect.getQuery();
            SQLExpr whereExpr = query.getWhere();
            // 修改where表达式
            if (whereExpr == null) {
                query.setWhere(constraintsExpr);
            } else {
                SQLBinaryOpExpr newWhereExpr = new SQLBinaryOpExpr(whereExpr, SQLBinaryOperator.BooleanAnd, constraintsExpr);
                query.setWhere(newWhereExpr);
            }
            sqlselect.setQuery(query);
            return sqlselect.toString();

        }

        return sql;
    }


    /**
     * 获取最终的sql语句
     *
     * @param configuration 节点配置
     * @param boundSql      BoundSql
     * @param sqlId         mapper方法的全路径名
     * @param flag          是否需要拼接mapper方法的全路径名
     * @return String
     */
    private String getSql(Configuration configuration, BoundSql boundSql, String sqlId, boolean flag) throws NoSuchFieldException {
        String sql = showSql(configuration, boundSql);
        return flag ? sqlId + ":" + sql : sql;
    }


    /**
     * 进行？的替换
     *
     * @param configuration 节点的配置
     * @param boundSql      BoundSql
     * @return String
     */
    private String showSql(Configuration configuration, BoundSql boundSql) {
        //获取参数
        Object parameterObject = boundSql.getParameterObject();
        List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
        //sql语句
        String sql = boundSql.getSql().replaceAll("[\\s]+", " ");
        if (CollUtil.isNotEmpty(parameterMappings) && parameterObject != null) {
            //获取类型处理器
            TypeHandlerRegistry typeHandlerRegistry = configuration.getTypeHandlerRegistry();
            //对应的类型则进行替换
            if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
                sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(parameterObject)));
            } else {
                MetaObject metaObject = configuration.newMetaObject(parameterObject);
                for (ParameterMapping parameterMapping : parameterMappings) {
                    String propertyName = parameterMapping.getProperty();
                    if (metaObject.hasGetter(propertyName)) {
                        Object objectValue = metaObject.getValue(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(objectValue)));
                    }
                    if (boundSql.hasAdditionalParameter(propertyName)) {
                        //动态sql
                        Object additionalParameter = boundSql.getAdditionalParameter(propertyName);
                        sql = sql.replaceFirst("\\?", Matcher.quoteReplacement(getParameterValue(additionalParameter)));
                    }
                    //else {
                    //    sql = sql.replaceFirst("\\?", "");
                    //}
                }
            }
        }
        return sql;
    }

    /**
     * 参数二次处理
     *
     * @param parameterObject parameterObject
     * @return String
     */
    private String getParameterValue(Object parameterObject) {
        String format = "'%s'";
        String value = "";
        if (null != parameterObject) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof String) {
            value = String.valueOf(parameterObject);
        }
        if (parameterObject instanceof Date) {
            //DateFormat dateTimeInstance = DateFormat.getDateTimeInstance(DateFormat.DEFAULT, DateFormat.DEFAULT,
            // Locale.CHINA);
            //value = dateTimeInstance.format(parameterObject);
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
            value = sdf.format((Date) parameterObject);
        }
        if (parameterObject instanceof LocalDateTime) {
            value = ((LocalDateTime) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        }
        if (parameterObject instanceof LocalDate) {
            value = ((LocalDate) parameterObject).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        }
        if (parameterObject instanceof LocalTime) {
            value = ((LocalTime) parameterObject).format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        }
        if (parameterObject instanceof Timestamp) {
            value = ((Timestamp) parameterObject).toString();
        }
        return String.format(format, value);
    }

    @Override
    public Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }

    @Override
    public void setProperties(Properties properties) {
        Interceptor.super.setProperties(properties);
    }
}
```

# 3. 实现的效果

1. 将自定义注解和最终的拦截器复制到项目目录当中
2. 修改自己项目中分页插件的`@Order`比自定义插件小，这一步我也不知道有用没，反正我加了有用
3. 在Mapper的方法中添加相应的注解

```java
public interface UserMapper {
    @PermissionControl(tableName = "tb_user", tableAlias = "user", paramIndex = 2)
    List<User> getUserList(Page page, @Param("param") UserQueryDto dto);
}
```

```xml
<select id="getUserList" resultType="user">
	select id,name,age
    from tb_user user
    left join tb_user_address  ua on ua.id = user.id
   where user,delete_flag = false 
</select>
```

按照当前的这个注解，就会在where条件最后拼接上对应的sql语句

4. 修改自定义拦截器`contactConditions`方法中的`{}.{} in (xxx)`语句

## 1. 示例

> 如，我想要查询当前在某个部门下的数据,需要 `user.dept_id`在某个部门列表中，

1. 我们需要添加一个

 ```sql
 and user.dept_id = xxx 
 -- 或者是下边这个形式的
 and user.dept_id in (select id from tb_dept where dept_name like '%${deptName}%')
 ```

2.  这个就需要按照第四步修改对应的语句

```java
String str = StrUtil.format("{}.{} = '{}')",
                            tableAlias, columnName, String.valueOf(fieldValue));
// 这列的StrUtil用的是hutool工具包里边的
String str = StrUtil.format("{}.{} in (select id from tb_dept where dept_name like '%{}%')",
                            tableAlias, columnName, String.valueOf(fieldValue));
```

3. 给方法上添加对应的注解

> 这里已经知道了要对应的关系是
>
> | 属性       | 值      | 描述                                                         |
> | ---------- | ------- | ------------------------------------------------------------ |
> | tableName  | tb_user | 和权限表有关联的表                                           |
> | tableAlias | user    | 和tableName二选一，建议用这个                                |
> | columnName | dept_id | tb_user表中和部门表关联的字段                                |
> | fieldName  |         | 这个要看UserQueryDto中对应的字段是什么，<br/>通过反射复制到上边最后的一个{}中 |
> | paramIndex | 2       | 这个值是参数在方法中的位置，默认从1开始的，<br/>所以注解中默认了一个2，具体的可以断点在`contactConditions`方法看`paramMap`这个Map里边的值 |
>
> 按照上述规则可以写出来一个注解

```java
@PermissionControl(tableAlias = "user", columnName = "dept_id", fieldName = "deptId")
```

4. 最终效果

```sql
select id,name,age
    from tb_user user
    left join tb_user_address  ua on ua.id = user.id
   where user,delete_flag = false 
   -- 这个xxx是从UserQueryDto通过反射获取的deptId的值
   and user.dept_id = 'xxx'
```

## 2. 扩展

1. 最后边的条件可以通过注解特异化，每一个注解修饰的方法都注入不同的sql
2. 可以加一个`paramName`属性，修改`contactConditions`方法

```java
// 这里可以判断如果存在paramName直接从paramMap获取
String paramName = permissionControl.paramName();
String paramIndex = "param" + permissionControl.paramIndex();
Object param = paramMap.get(StrUtil.isNotBlank(paramName) ? paramName : paramIndex);
Object fieldValue = ReflectUtil.getFieldValue(param, permissionControl.fieldName());
```

# X.参考链接

- [数据权限设计之Mybatis拦截器追加sql的where条件](https://blog.csdn.net/codeblf2/article/details/102981078)
- 后续我想起来了在加
