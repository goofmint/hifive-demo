(function($) {
	var pageController = {
		__name: 'sample.PageController',

		__templates: 'template/sample-template.ejs',

		_dividedBoxController: h5.ui.container.DividedBox,

		_appPurchaseManagerController: sample.AppPurchaseManagerController,

		appRootDividedBox: h5.ui.container.DividedBox,

		__meta: {
			_appPurchaseManagerController: {
				rootElement: '.appRoot'
			}
		},

		__postInit: function() {
			// ヘッダ直後のdividerは非表示
			this._dividedBoxController.hideDivider(0);
		},

		'{window} resize': function() {
			this._dividedBoxController.refresh();
		}
	};
	h5.core.expose(pageController);
})(jQuery);