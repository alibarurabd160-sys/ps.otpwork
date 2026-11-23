package com.psnumber.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    companion object {
        private const val PREFS_NAME = "ps_number_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val DEFAULT_APP_URL =
            "https://ais-pre-uzt2m2j3i3bq4hm5hxy56m-604740698461.asia-east1.run.app"
    }

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            val hPad = dp(10)
            val vPad = dp(4)
            setPadding(hPad, vPad, hPad, vPad)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val titleView = TextView(this).apply {
            text = getString(R.string.app_name)
            setTextColor(Color.parseColor("#F8FAFC"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            layoutParams = LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
            )
        }

        val urlButton = Button(this).apply {
            text = getString(R.string.server_url_button)
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextColor(Color.parseColor("#E2E8F0"))
            setBackgroundColor(Color.parseColor("#1E293B"))
            setPadding(dp(10), dp(2), dp(10), dp(2))
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(28)
            minimumHeight = dp(28)
            setOnClickListener { showConfigureUrlDialog() }
        }

        val reloadButton = Button(this).apply {
            text = getString(R.string.reload_button)
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextColor(Color.parseColor("#0F172A"))
            setBackgroundColor(Color.parseColor("#34D399"))
            setPadding(dp(10), dp(2), dp(10), dp(2))
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(28)
            minimumHeight = dp(28)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = dp(6)
            }
            setOnClickListener {
                offlineContainer.visibility = View.GONE
                webView.visibility = View.VISIBLE
                webView.reload()
            }
        }

        topBar.addView(titleView)
        topBar.addView(urlButton)
        topBar.addView(reloadButton)

        progressBar = ProgressBar(
            this,
            null,
            android.R.attr.progressBarStyleHorizontal
        ).apply {
            max = 100
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3)
            )
        }

        val contentFrame = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        configureWebView(webView)

        offlineContainer = buildOfflineView()
        contentFrame.addView(webView)
        contentFrame.addView(offlineContainer)

        root.addView(topBar)
        root.addView(progressBar)
        root.addView(contentFrame)

        setContentView(root)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            }
        )

        loadConfiguredUrl()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(target: WebView) {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(target, false)

        target.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            displayZoomControls = false
        }

        target.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }
        }

        target.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return true
                if (url == "about:blank") return false
                return !isSafeHttpsUrl(url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    webView.visibility = View.GONE
                    offlineContainer.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun buildOfflineView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(dp(24), dp(24), dp(24), dp(24))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )

            val heading = TextView(this@MainActivity).apply {
                text = getString(R.string.offline_title)
                setTextColor(Color.parseColor("#F8FAFC"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                gravity = Gravity.CENTER
            }

            val subtitle = TextView(this@MainActivity).apply {
                text = getString(R.string.offline_subtitle)
                setTextColor(Color.parseColor("#94A3B8"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, dp(16))
            }

            val retryBtn = Button(this@MainActivity).apply {
                text = getString(R.string.reload_button)
                isAllCaps = false
                setTextColor(Color.parseColor("#0F172A"))
                setBackgroundColor(Color.parseColor("#34D399"))
                setOnClickListener { loadConfiguredUrl() }
            }

            val changeUrlBtn = Button(this@MainActivity).apply {
                text = getString(R.string.server_url_button)
                isAllCaps = false
                setTextColor(Color.parseColor("#E2E8F0"))
                setBackgroundColor(Color.parseColor("#1E293B"))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(10)
                }
                setOnClickListener { showConfigureUrlDialog() }
            }

            addView(heading)
            addView(subtitle)
            addView(retryBtn)
            addView(changeUrlBtn)
        }
    }

    private fun loadConfiguredUrl() {
        val url = getConfiguredUrl()
        offlineContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl(url)
    }

    private fun getConfiguredUrl(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_SERVER_URL, DEFAULT_APP_URL) ?: DEFAULT_APP_URL
        return if (isSafeHttpsUrl(saved)) saved else DEFAULT_APP_URL
    }

    private fun saveConfiguredUrl(url: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
    }

    private fun showConfigureUrlDialog() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            hint = getString(R.string.configure_url_hint)
            setText(getConfiguredUrl())
            setSelection(text.length)
        }

        val container = FrameLayout(this).apply {
            setPadding(dp(20), dp(10), dp(20), dp(4))
            addView(input)
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.configure_url_title)
            .setView(container)
            .setPositiveButton(R.string.save_label) { _, _ ->
                val candidate = input.text.toString().trim()
                if (isSafeHttpsUrl(candidate)) {
                    saveConfiguredUrl(candidate)
                    loadConfiguredUrl()
                } else {
                    Toast.makeText(
                        this,
                        R.string.invalid_url_error,
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNeutralButton(R.string.reset_label) { _, _ ->
                saveConfiguredUrl(DEFAULT_APP_URL)
                loadConfiguredUrl()
            }
            .setNegativeButton(R.string.cancel_label, null)
            .show()
    }

    private fun isSafeHttpsUrl(rawUrl: String): Boolean {
        val uri = try {
            Uri.parse(rawUrl.trim())
        } catch (_: Exception) {
            return false
        }
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host ?: return false
        return scheme == "https" && host.isNotBlank()
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
