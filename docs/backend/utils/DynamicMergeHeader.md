1. 工具类

```java
package net.lesscoding.utils;

import cn.hutool.core.bean.BeanUtil;
import com.alibaba.excel.EasyExcel;
import com.google.common.collect.Lists;

import javax.servlet.ServletOutputStream;
import javax.servlet.http.HttpServletResponse;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * @author eleven
 * @date 2024/1/10 16:35
 * @apiNote
 */
public class DynamicHeaderUtil<T> {

    private static void setResponseHeader(HttpServletResponse response, String fileName) throws UnsupportedEncodingException {
        response.setHeader("Content-Disposition", "attachment;filename=" + URLEncoder.encode(fileName, "UTF-8"));
        response.setHeader("Connection", "close");
        response.setHeader("Content-Type", "application/octet-stream");
    }

    private static  <T> List<List<Object>> dataList(List<T> list, String... fields) {
        return list.stream()
                .map(entity -> Arrays.stream(fields)
                        .map(field -> Optional.ofNullable(BeanUtil.beanToMap(entity).get(field)).orElse(""))
                        .collect(Collectors.toList()))
                .collect(Collectors.toList());
    }

    private static List<List<String>> dynamicHeader(String[] head) {
        return Arrays.stream(head)
                .map(item -> Lists.newArrayList(item.split(",")))
                .collect(Collectors.toList());
    }

    public static <T> void exportExcel(HttpServletResponse response, List<T> list, String fileName, String[] headerArray, String[] fields) throws Exception {
        setResponseHeader(response, fileName);
        try (ServletOutputStream outputStream = response.getOutputStream()){
            EasyExcel.write(outputStream)
                    // 这里放入动态头
                    .head(dynamicHeader(headerArray))
                    .sheet("模板")
                    .doWrite(dataList(list, fields));
        }

    }
}
```

2. 使用
```java
package net.lesscoding.controller;

import cn.dev33.satoken.annotation.SaIgnore;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import net.lesscoding.entity.Account;
import net.lesscoding.mapper.AccountMapper;
import net.lesscoding.utils.DynamicHeaderUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletResponse;
import java.util.List;

/**
 * @author eleven
 * @date 2024/1/10 16:34
 * @apiNote
 */
@RestController
@RequestMapping("/test")
@SaIgnore
public class TestController {
    @Autowired
    private AccountMapper accountMapper;


    @GetMapping("/download")
    public void download(HttpServletResponse response) throws Exception {
        List<Account> accounts = accountMapper.selectList(new QueryWrapper<Account>()
                .last("limit 10"));
        DynamicHeaderUtil.exportExcel(response,
                accounts,
                "test",
                new String[]{
                        "个人信息,网络信息,省份",
                        "个人信息,网络信息,IP",
                        "个人信息,昵称",
                        "个人信息,账号",
                        "个人信息,Mac",
                },
                new String[]{"region", "nickname", "account", "mac"});
    }
}
```
