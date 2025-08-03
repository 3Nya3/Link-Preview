// ==UserScript==
// @name         Link Preview
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  An open source link previewer alternative to MaxFocus with improvements
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
  
    const settings = {
      isDragMode: true,
      width: 500,
      height: 400,
      dragThreshold: 30
    };
  
    let previewWindow = null;
    let draggedLink = null;
    let isCreatingPreview = false;
    let isPreviewCreated = false;
    let linkClickPrevented = false;
  
    // Load saved settings from localStorage
    function loadSavedSettings() {
      const savedSettings = localStorage.getItem("linkPreviewSettings");
      if (savedSettings) {
        Object.assign(settings, JSON.parse(savedSettings));
      }
    }
  
    // Save settings to localStorage
    function saveSettings() {
      if (previewWindow) {
        settings.width = previewWindow.offsetWidth;
        settings.height = previewWindow.offsetHeight;
      }
      localStorage.setItem("linkPreviewSettings", JSON.stringify(settings));
    }
  
    // Load saved settings on script initialization
    loadSavedSettings();
  
    // Event delegation for link interaction
    document.addEventListener("mousedown", handleMouseDown);
  
    // Inject CSS to prevent text selection
    const style = document.createElement("style");
    style.textContent = `
      .no-select {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
      }
  
      .link-preview-dragging {
          position: relative;
      }
  
      .link-preview-dragging::after {
          content: '🔍';
          position: absolute;
          top: -20px;
          right: -20px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          padding: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          font-size: 12px;
          pointer-events: none;
          animation: preview-indicator 0.3s ease-in;
      }
  
      @keyframes preview-indicator {
          from {
              opacity: 0;
              transform: scale(0.8);
          }
          to {
              opacity: 1;
              transform: scale(1);
          }
      }
  `;
    document.head.appendChild(style);

    // Dark mode adjustments
    const darkStyle = document.createElement("style");
    darkStyle.textContent = `
      @media (prefers-color-scheme: dark) {
        #link-preview-window input {
          background: rgba(50, 50, 50, 0.8);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
        }
        #link-preview-window button {
          background: rgba(70, 70, 70, 0.8);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
        }
        #link-preview-window .error-message {
          background-color: rgba(40, 40, 40, 0.9);
          color: #fff;
        }
      }
    `;
    document.head.appendChild(darkStyle);
  
    function handleMouseDown(e) {
      if (previewWindow) return;
  
      const target = e.target.closest("a, [data-href]");
      if (!target) return;
  
      const url = target.href || target.dataset.href;
      if (!url) return;
  
      draggedLink = target;
      isPreviewCreated = false;
      linkClickPrevented = false;
  
      const startX = e.clientX;
      const startY = e.clientY;
  
      if (settings.isDragMode) {
        // Add no-select to a broader area around the link
        document.body.classList.add("no-select");
        target.classList.add("no-select");
  
        // Find parent containers that might have text
        let parent = target.parentElement;
        while (parent && parent !== document.body) {
          parent.classList.add("no-select");
          parent = parent.parentElement;
        }
  
        const dragHandler = (moveEvent) =>
          handleDrag(moveEvent, startX, startY, url);
        document.addEventListener("mousemove", dragHandler);
  
        const cleanupSelection = () => {
          document.removeEventListener("mousemove", dragHandler);
          document.body.classList.remove("no-select");
          target.classList.remove("no-select");
  
          // Clean up parent containers
          let cleanParent = target.parentElement;
          while (cleanParent && cleanParent !== document.body) {
            cleanParent.classList.remove("no-select");
            cleanParent = cleanParent.parentElement;
          }
        };
  
        document.addEventListener("mouseup", cleanupSelection, { once: true });
      } else {
        e.preventDefault();
        target.addEventListener("click", handleLinkClick);
        setTimeout(() => {
          if (draggedLink) {
            createPreviewWindow(url, e.clientX, e.clientY);
            isPreviewCreated = true;
            linkClickPrevented = true;
          }
        }, 500);
      }
  
      document.addEventListener("mouseup", stopInteraction, { once: true });
    }
  
    function handleDrag(e, startX, startY, url) {
      if (!draggedLink || isCreatingPreview) return;
  
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.hypot(dx, dy);
  
      // Add visual feedback when getting close to threshold
      if (distance > settings.dragThreshold * 0.5) {
        draggedLink.classList.add("link-preview-dragging");
      }
  
      if (distance > settings.dragThreshold) {
        isCreatingPreview = true;
        draggedLink.classList.remove("link-preview-dragging");
        createPreviewWindow(url, e.clientX, e.clientY);
        isPreviewCreated = true;
        linkClickPrevented = true;
        document.removeEventListener("mousemove", handleDrag);
      }
    }
  
    function stopInteraction(e) {
      if (isPreviewCreated) {
        linkClickPrevented = true;
        e.preventDefault();
      }
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", stopInteraction);
  
      // Ensure no-select and preview-dragging are removed
      document.body.classList.remove("no-select");
      if (draggedLink) {
        draggedLink.classList.remove("no-select");
        draggedLink.classList.remove("link-preview-dragging");
      }
  
      setTimeout(() => {
        if (draggedLink && !settings.isDragMode) {
          draggedLink.removeEventListener("click", handleLinkClick);
        }
        draggedLink = null;
        isCreatingPreview = false;
        isPreviewCreated = false;
        linkClickPrevented = false;
      }, 100);
    }
  
    function handleLinkClick(e) {
      if (linkClickPrevented) {
        e.preventDefault();
        e.stopPropagation();
        linkClickPrevented = false;
      }
    }
  
    // Create preview window
    function createPreviewWindow(url, x, y) {
      if (previewWindow) {
        closePreviewWindow();
      }
  
      // Create div for preview window
      previewWindow = document.createElement("div");
      previewWindow.id = "link-preview-window";
      previewWindow.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: ${settings.width}px;
          height: ${settings.height}px;
          background-color: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 12px;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
          z-index: 9999;
          resize: both;
          overflow: hidden;
  
          &:hover {
              border-color: rgba(255, 255, 255, 0.8);
              box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.25);
          }
      `;
  
      // Create title bar (now includes address bar)
      const titleBar = createTitleBar(url);
  
      // Create content
      const contentContainer = createContentContainer(url);
  
      // Append elements
      previewWindow.appendChild(titleBar);
      previewWindow.appendChild(contentContainer);
      document.body.appendChild(previewWindow);
  
      // Make it draggable
      titleBar.addEventListener("mousedown", initDrag);
  
      // Make it resizable
      previewWindow.addEventListener("resize", saveSettings);
  
      let left = x;
      let top = y;
  
      if (left + settings.width > window.innerWidth) {
        left = window.innerWidth - settings.width;
      }
      if (left < 0) {
        left = 0;
      }
  
      if (top + settings.height > window.innerHeight) {
        top = window.innerHeight - settings.height;
      }
      if (top < 0) {
        top = 0;
      }
  
      previewWindow.style.left = `${left}px`;
      previewWindow.style.top = `${top}px`;
  
      // Clean up on close
      previewWindow.addEventListener("mouseup", saveSettings);
      previewWindow.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closePreviewWindow();
        }
      });
  
      // Handle iframe content loading
      handleIframeContentLoading(contentContainer, url);
    }
  
    function createTitleBar(url) {
      const titleBar = document.createElement("div");
      titleBar.style.cssText = `
          height: 40px;
          background-color: rgba(255, 255, 255, 0.8);
          padding: 0 15px;
          cursor: move;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 10px 10px 0 0;
      `;
  
      // Title
      const title = document.createElement("span");
      title.textContent = "Link Preview";
      title.style.cssText = `
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: bold;
          color: #333;
          flex-shrink: 0;
      `;
      titleBar.appendChild(title);
  
      // Address bar - now in title bar
      const addressBar = createAddressBar(url);
      // Preserve existing flex layout and just ensure it takes remaining space
      addressBar.style.flex = "1";
      addressBar.style.margin = "4px 0";
      
      // Update the input field inside the address bar container
      const addressInput = addressBar.input;
      if (addressInput) {
        addressInput.style.cssText = `
            height: 24px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 4px;
            padding: 0 8px;
            font-size: 12px;
            background: rgba(255, 255, 255, 0.9);
            color: #333;
    
            &:hover {
                border-color: rgba(0, 0, 0, 0.2);
            }
        `;
      }
      titleBar.appendChild(addressBar);
  
      // Controls container for toggle and close
      const controls = document.createElement("div");
      controls.style.cssText = `
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
      `;
  
      // Mode toggle
      const modeToggle = createModeToggle();
      controls.appendChild(modeToggle);
  
      // Close button
      const closeButton = createCloseButton();
      controls.appendChild(closeButton);
  
      titleBar.appendChild(controls);
  
      return titleBar;
    }
  
    function createModeToggle() {
      const modeToggle = document.createElement("button");
      modeToggle.textContent = settings.isDragMode ? "Drag" : "Click";
      modeToggle.style.cssText = `
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 4px;
          font-size: 12px;
          color: #333;
          cursor: pointer;
          padding: 4px 8px;
          margin-right: 10px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
          }
      `;
      modeToggle.onclick = (e) => {
        e.stopPropagation();
        settings.isDragMode = !settings.isDragMode;
        modeToggle.textContent = settings.isDragMode ? "Drag" : "Click";
        saveSettings();
      };
      return modeToggle;
    }
  
    function createCloseButton() {
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "&times;";
      closeButton.style.cssText = `
              background: none;
              border: none;
              font-size: 20px;
              color: #333;
              cursor: pointer;
              padding: 0;
              width: 24px;
              height: 24px;
              display: flex;
              justify-content: center;
              align-items: center;
              border-radius: 50%;
              transition: background-color 0.3s;
          `;
      closeButton.onmouseover = () => {
        closeButton.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
      };
      closeButton.onmouseout = () => {
        closeButton.style.backgroundColor = "transparent";
      };
      closeButton.onclick = closePreviewWindow;
      return closeButton;
    }
  
    function createAddressBar(url) {
      // Create container for address bar and buttons
      const container = document.createElement("div");
      container.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          width: calc(100% - 20px);
          margin: 8px 10px;
      `;
      
      // Create editable input field
      const addressBar = document.createElement("input");
      addressBar.type = "text";
      addressBar.value = url;
      addressBar.style.cssText = `
          flex: 1;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          padding: 0 10px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          box-sizing: border-box;
          transition: border-color 0.2s ease;
  
          &:hover {
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.textContent = "📋";
      copyButton.title = "Copy URL";
      copyButton.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      copyButton.style.color = "#333";
      // Add copy functionality
      copyButton.addEventListener("click", (e) => {
          e.stopPropagation();
          addressBar.select();
          document.execCommand("copy");
          
          // Visual feedback
          const originalText = copyButton.textContent;
          copyButton.textContent = "✓";
          setTimeout(() => {
              copyButton.textContent = originalText;
          }, 1000);
      });
      
      // Create search button
      const searchButton = document.createElement("button");
      searchButton.textContent = "🔍";
      searchButton.title = "Search with URL";
      searchButton.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
  
          &:hover {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(0, 0, 0, 0.2);
          }
      `;
      
      searchButton.style.color = "#333";
      // Add search functionality
      searchButton.addEventListener("click", (e) => {
          e.stopPropagation();
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(addressBar.value)}`;
          
          // Navigate within the preview iframe instead of opening new tab
          const previewWindow = document.getElementById("link-preview-window");
          if (previewWindow) {
            const iframe = previewWindow.querySelector("iframe");
            if (iframe) {
              iframe.src = searchUrl;
              addressBar.value = searchUrl;
            }
          }
      });
      
      // Add elements to container
      container.appendChild(addressBar);
      container.appendChild(copyButton);
      container.appendChild(searchButton);
      
      // Store reference to input for external access
      container.input = addressBar;
      
      // Prevent dragging when clicking on the input field
      addressBar.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      
      // Allow Enter key to navigate to the URL
      addressBar.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const newUrl = addressBar.value.trim();
          if (newUrl) {
            // Find the iframe and update its src
            const previewWindow = document.getElementById("link-preview-window");
            if (previewWindow) {
              const iframe = previewWindow.querySelector("iframe");
              if (iframe) {
                iframe.src = newUrl;
              }
            }
          }
        }
      });
      
      return container;
    }
  
    function createContentContainer(url) {
      const container = document.createElement("div");
      container.style.cssText = `
          width: 100%;
          height: calc(100% - 40px);
          overflow: hidden;
          position: relative;
      `;
  
      // Create content based on URL
      const content = createContent(url);
      container.appendChild(content.element);
  
      // Cleanup function
      container.contentCleanup = content.cleanup;
  
      //const loader = createLoadingIndicator();
      //container.appendChild(loader);
  
      //content.element.onload = () => {
      //  loader.remove();
      //};
  
      return container;
    }
  
    function createLoadingIndicator() {
      const loader = document.createElement("div");
      loader.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top-color: #333;
          animation: spin 1s linear infinite;
      `;
  
      const keyframes = document.createElement("style");
      keyframes.textContent = `
          @keyframes spin {
              to { transform: translate(-50%, -50%) rotate(360deg); }
          }
      `;
      document.head.appendChild(keyframes);
  
      return loader;
    }
  
    function createContent(url) {
      if (isYouTubeLink(url)) {
        return createYouTubeContent(url);
      } else {
        return createStandardContent(url);
      }
    }
  
    function isYouTubeLink(url) {
      const youtubeRegex =
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
      return youtubeRegex.test(url);
    }
  
    function createYouTubeContent(url) {
      const videoId = url.match(
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/
      )[1];
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
      iframe.style.cssText = `
              width: 100%;
              height: 100%;
              border: none;
          `;
      iframe.allow = "autoplay; encrypted-media";
      iframe.allowFullscreen = true;
  
      return {
        element: iframe,
        cleanup: () => {
          iframe.src = "about:blank";
        }
      };
    }
  
    function createStandardContent(url) {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.style.cssText = `
              width: 100%;
              height: 100%;
              border: none;
          `;
      iframe.onload = () => {
        // Content loaded successfully
      };
      iframe.onerror = () => {
        showContentError(iframe, url);
      };
  
      return {
        element: iframe,
        cleanup: () => {
          iframe.src = "about:blank";
        }
      };
    }
  
    function showContentError(iframe, url) {
      const errorMessage = document.createElement("div");
      errorMessage.className = "error-message";
      errorMessage.style.cssText = `
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              text-align: center;
              padding: 20px;
              font-family: Arial, sans-serif;
              background-color: #fff;
              color: #333;
              border-radius: 10px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          `;
      errorMessage.innerHTML = `
              <p>This page cannot be displayed in the preview.</p>
              <button id="openInNewTab">Open in New Tab</button>
          `;
  
      errorMessage.querySelector("#openInNewTab").onclick = (e) => {
        e.stopPropagation();
        window.open(url, "_blank");
      };
  
      iframe.style.display = "none";
      iframe.parentNode.appendChild(errorMessage);
    }
  
    function handleIframeContentLoading(container, url) {
      const iframe = container.querySelector("iframe");
      if (iframe) {
        iframe.onload = () => {
          try {
            const iframeDocument =
              iframe.contentDocument || iframe.contentWindow.document;
            iframeDocument.addEventListener("click", (e) => {
              const link = e.target.closest("a");
              if (link && link.href) {
                e.preventDefault();
                iframe.src = link.href;
                
                // Update the address bar with the new URL
                const titleBar = container.previousElementSibling;
                if (titleBar) {
                  // Find the address bar container (it's a div containing the input and buttons)
                  const addressBarContainer = titleBar.querySelector('div[style*="display: flex"]');
                  if (addressBarContainer && addressBarContainer.input) {
                    addressBarContainer.input.value = link.href;
                  }
                }
              }
            });
          } catch (e) {
            // Handle cross-origin issues
            showContentError(iframe, url);
          }
        };
      }
    }
  
    function closePreviewWindow() {
      if (previewWindow) {
        saveSettings();
  
        // Remove event listeners
        const titleBar = previewWindow.querySelector("div");
        if (titleBar) {
          titleBar.removeEventListener("mousedown", initDrag);
        }
  
        // Stop any playing YouTube videos
        const youtubeIframe = previewWindow.querySelector(
          'iframe[src*="youtube.com"]'
        );
        if (youtubeIframe) {
          youtubeIframe.src = "about:blank";
        }
  
        // Clean up content
        if (previewWindow.contentCleanup) {
          previewWindow.contentCleanup();
        }
  
        // Remove the window from the DOM
        document.body.removeChild(previewWindow);
        previewWindow = null;
  
        // Reset flags
        draggedLink = null;
        isCreatingPreview = false;
        isPreviewCreated = false;
        linkClickPrevented = false;
      }
    }
  
    function initDrag(e) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = previewWindow.offsetLeft;
      const startTop = previewWindow.offsetTop;
  
      function drag(e) {
        const newLeft = startLeft + e.clientX - startX;
        const newTop = startTop + e.clientY - startY;
        previewWindow.style.left = `${newLeft}px`;
        previewWindow.style.top = `${newTop}px`;
      }
  
      function stopDrag() {
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", stopDrag);
        saveSettings();
      }
  
      document.addEventListener("mousemove", drag);
      document.addEventListener("mouseup", stopDrag);
    }
  })();
  