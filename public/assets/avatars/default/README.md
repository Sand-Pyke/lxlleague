# 注册默认表情头像

`emoji-01.svg` ~ `emoji-24.svg` 是本项目的**注册默认头像**：新用户注册时会随机拿到其中一个，
之后可以在「我的资料 → 选择表情头像」里更换，或直接上传自己的图片。

## 素材来源与许可

- 表情图形：[Twemoji](https://github.com/jdecked/twemoji)（`assets/svg/*.svg`），
  图形版权归 Twitter/X 及 Twemoji 贡献者所有，以 **CC-BY 4.0** 授权发布。
  本项目只做了「叠在渐变圆底上并等比居中缩放」的合成，未修改表情造型。
- 渐变圆底：本项目自行生成，无第三方素材。

按 CC-BY 4.0 的要求，在此保留署名：**Emoji graphics © Twitter, Inc. and other contributors, licensed under CC-BY 4.0.**

> 之前也评估过 [Noto Emoji](https://github.com/googlefonts/noto-emoji)（Apache-2.0）、
> [OpenMoji](https://openmoji.org/)（CC BY-SA 4.0，带传染性）和
> [DiceBear](https://www.dicebear.com/)（MIT，需要在运行期引入依赖生成）。
> 最终选 Twemoji：同为扁平风、单个 SVG 约 1 KB（24 个合计约 41 KB），
> 直接静态托管即可，不会为构建/运行期增加依赖。

## 重新生成

改了表情清单或配色后执行：

```bash
npm run assets:default-avatars
```

脚本（`scripts/build-default-avatars.mjs`）会从 Twemoji 仓库拉取原始 SVG，
把表情等比缩到 128×128 画布的 74% 并居中，叠上该头像自己的线性渐变圆形底，
写入本目录。**生成结果需要提交进仓库**——运行环境不联网，容器镜像也只打包 `public/`。

新增/删除头像时记得同步更新白名单 `src/lib/default-avatars.ts`。
