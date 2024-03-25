import {defineConfig} from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
    base: "/notes/",
    title: "艾门传说",
    description: "门的成神之路",
    themeConfig: {

        search: {
            provider: 'local',
            options: {
                locales: {
                    zh: {
                        translations: {
                            button: {
                                buttonText: '搜索文档',
                                buttonAriaLabel: '搜索文档'
                            },
                            modal: {
                                noResultsText: '无法找到相关结果',
                                resetButtonTitle: '清除查询条件',
                                footer: {
                                    selectText: '选择',
                                    navigateText: '切换'
                                }
                            }
                        }
                    }
                }
            }
            // options: {
            //     appId: '6CVQ2MLIBR',
            //     apiKey: 'e2db58a9bdfc1f91405aaf06978755d1',
            //     indexName: 'liumang2513io',
            //     //i18国际化配置
            //     locales: {
            //         zh: {
            //             placeholder: '搜索文档',
            //             translations: {
            //                 button: {
            //                     buttonText: '搜索文档',
            //                     buttonAriaLabel: '搜索文档'
            //                 },
            //                 modal: {
            //                     searchBox: {
            //                         resetButtonTitle: '清除查询条件',
            //                         resetButtonAriaLabel: '清除查询条件',
            //                         cancelButtonText: '取消',
            //                         cancelButtonAriaLabel: '取消'
            //                     },
            //                     startScreen: {
            //                         recentSearchesTitle: '搜索历史',
            //                         noRecentSearchesText: '没有搜索历史',
            //                         saveRecentSearchButtonTitle: '保存至搜索历史',
            //                         removeRecentSearchButtonTitle: '从搜索历史中移除',
            //                         favoriteSearchesTitle: '收藏',
            //                         removeFavoriteSearchButtonTitle: '从收藏中移除'
            //                     },
            //                     errorScreen: {
            //                         titleText: '无法获取结果',
            //                         helpText: '你可能需要检查你的网络连接'
            //                     },
            //                     footer: {
            //                         selectText: '选择',
            //                         navigateText: '切换',
            //                         closeText: '关闭',
            //                         searchByText: '搜索提供者'
            //                     },
            //                     noResultsScreen: {
            //                         noResultsText: '无法找到相关结果',
            //                         suggestedQueryText: '你可以尝试查询',
            //                         reportMissingResultsText: '你认为该查询应该有结果？',
            //                         reportMissingResultsLinkText: '点击反馈'
            //                     }
            //                 }
            //             }
            //         }
            //     }
            // }
        },
        // https://vitepress.dev/reference/default-theme-config
        nav: [
            {text: 'Home', link: '/'},
            // {text: 'Examples', link: '/markdown-examples'},
            {
                text: '后端',
                items: [
                    {
                        text: '消息中间件',
                        link: '/backend/mq/index'
                    },
                    {
                        text: 'nginx',
                        link: '/backend/nginx/nginx子请求鉴权'
                    },
                    {
                        text: 'utils',
                        link: '/backend/utils/DynamicMergeHeader'
                    }
                ]
            }
        ],

        sidebar: [
            {
                // text: 'Examples',
                // items: [
                //     {text: 'Markdown Examples', link: '/markdown-examples'},
                //     {text: 'Runtime API Examples', link: '/api-examples'}
                // ]
                text: '消息中间件',
                items: [
                    {
                        text: 'mq',
                        link: '/backend/mq/index'
                    }
                ]
            },
            {
                text: 'nginx',
                items: [
                    {
                        text: 'nginx子请求鉴权',
                        link: '/backend/nginx/nginx子请求鉴权'
                    }
                ]
            },
            {
                text: 'utils',
                items: [
                    {
                        text: 'DynamicMergeHeader',
                        link: '/backend/utils/DynamicMergeHeader'
                    },
                    {
                        text: 'exportWord',
                        link: '/backend/utils/exportWord'
                    },
                    {
                        text: 'permissionControl',
                        link: '/backend/utils/permissionControl'
                    }
                ]
            }
        ],

        socialLinks: [
            {icon: 'github', link: 'https://www.pronhub.com'}
        ],
        docFooter: {
            prev: '上一篇',
            next: '下一篇'
        },
        outline: {
            label: '目录',
            level: [1, 2]
        },
    }
})
