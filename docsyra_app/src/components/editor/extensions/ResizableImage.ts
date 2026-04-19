import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

export const ResizableImage = Node.create({
  name: "resizableImage",

  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      width: { default: "100%" },
      align: { default: "center" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-type='image']",
        getAttrs: (element) => {
          const figure = element as HTMLElement;
          const image = figure.querySelector("img");
          const caption = figure.querySelector("figcaption");

          return {
            src: image?.getAttribute("src") ?? "",
            alt: image?.getAttribute("alt") ?? "",
            width: figure.style.width || image?.style.width || "100%",
            align: figure.getAttribute("data-align") ?? "center",
            caption: caption?.textContent ?? "",
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (element) => {
          const image = element as HTMLImageElement;
          return {
            src: image.getAttribute("src") ?? "",
            alt: image.getAttribute("alt") ?? "",
            width: image.style.width || "100%",
            align: "center",
            caption: "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes.align || "center";
    const marginValue =
      align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";

    return [
      "figure",
      mergeAttributes({
        "data-type": "image",
        "data-align": align,
        style: `width:${HTMLAttributes.width};margin:${marginValue};`,
      }),
      ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt }],
      ["figcaption", HTMLAttributes.caption || ""],
    ];
  },

  addNodeView() {
    return ({ editor, getPos, node }) => {
      const container = document.createElement("div");
      container.className = "image-wrapper";
      container.draggable = true;
      let isSelected = false;

      const applyAlignment = (align: "left" | "center" | "right") => {
        if (align === "left") {
          container.style.margin = "12px auto 12px 0";
        } else if (align === "right") {
          container.style.margin = "12px 0 12px auto";
        } else {
          container.style.margin = "12px auto";
        }

        setAttributes({ align });
      };

      const setAttributes = (attributes: Record<string, unknown>) => {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") {
          return;
        }

        const currentNode = editor.state.doc.nodeAt(pos);
        if (!currentNode) {
          return;
        }

        const transaction = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...currentNode.attrs,
          ...attributes,
        });

        editor.view.dispatch(transaction);
      };

      const img = document.createElement("img");
      img.src = node.attrs.src;
      img.alt = node.attrs.alt;
      img.style.width = node.attrs.width;

      const toolbar = document.createElement("div");
      toolbar.className = "image-toolbar";

      const leftButton = document.createElement("button");
      leftButton.type = "button";
      leftButton.textContent = "Align Left";
      leftButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyAlignment("left");
      };

      const centerButton = document.createElement("button");
      centerButton.type = "button";
      centerButton.textContent = "Center";
      centerButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyAlignment("center");
      };

      const rightButton = document.createElement("button");
      rightButton.type = "button";
      rightButton.textContent = "Align Right";
      rightButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyAlignment("right");
      };

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.className = "image-delete";
      deleteButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") {
          return;
        }

        const transaction = editor.state.tr.delete(pos, pos + node.nodeSize);
        editor.view.dispatch(transaction);
      };

      toolbar.appendChild(leftButton);
      toolbar.appendChild(centerButton);
      toolbar.appendChild(rightButton);
      toolbar.appendChild(deleteButton);

      const handle = document.createElement("div");
      handle.className = "resize-handle";

      handle.onmousedown = (mouseDownEvent) => {
        mouseDownEvent.preventDefault();

        const startX = mouseDownEvent.clientX;
        const startWidth = img.offsetWidth;

        const onMouseMove = (mouseMoveEvent: MouseEvent) => {
          const newWidth = Math.max(120, startWidth + (mouseMoveEvent.clientX - startX));
          img.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          setAttributes({ width: img.style.width });
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      };

      const caption = document.createElement("input");
      caption.className = "image-caption";
      caption.placeholder = "Write a caption...";
      caption.value = node.attrs.caption;
      caption.draggable = false;

      caption.onchange = () => {
        setAttributes({ caption: caption.value });
      };

      const showToolbar = (event: MouseEvent) => {
        event.stopPropagation();
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos === "number") {
          const transaction = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos));
          editor.view.dispatch(transaction);
        }

        document
          .querySelectorAll(".image-wrapper.active")
          .forEach((element) => element.classList.remove("active"));
        container.classList.add("active");
      };

      const hideToolbar = (event: MouseEvent) => {
        if (isSelected) {
          return;
        }

        if (!container.contains(event.target as globalThis.Node)) {
          container.classList.remove("active");
        }
      };

      container.addEventListener("click", showToolbar);
      document.addEventListener("click", hideToolbar);

      applyAlignment((node.attrs.align as "left" | "center" | "right") ?? "center");

      container.appendChild(toolbar);
      container.appendChild(img);
      container.appendChild(handle);
      container.appendChild(caption);

      return {
        dom: container,
        selectNode() {
          isSelected = true;
          container.classList.add("active", "selected");
        },
        deselectNode() {
          isSelected = false;
          container.classList.remove("selected", "active");
        },
        destroy() {
          container.removeEventListener("click", showToolbar);
          document.removeEventListener("click", hideToolbar);
        },
      };
    };
  },
});
