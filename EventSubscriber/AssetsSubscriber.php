<?php

declare(strict_types=1);

namespace MauticPlugin\GrapesJsBuilderBundle\EventSubscriber;

use Mautic\CoreBundle\CoreEvents;
use Mautic\CoreBundle\Event\CustomAssetsEvent;
use Mautic\InstallBundle\Install\InstallService;
use MauticPlugin\GrapesJsBuilderBundle\Integration\Config;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

class AssetsSubscriber implements EventSubscriberInterface
{
    /**
     * @var InstallService
     */
    private $installer;

    public function __construct(InstallService $installer)
    {
        $this->installer = $installer;
    }

    public static function getSubscribedEvents()
    {
        return [
            CoreEvents::VIEW_INJECT_CUSTOM_ASSETS => ['injectAssets', 0],
        ];
    }

    public function injectAssets(CustomAssetsEvent $assetsEvent)
    {
        if (!$this->installer->checkIfInstalled()) {
            return;
        }
            $assetsEvent->addScript('plugins/GrapesJsBuilderBundle/Assets/library/js/dist/builder.js');

            $assetsEvent->addStylesheet('plugins/GrapesJsBuilderBundle/Assets/library/css/builder.css');
            $assetsEvent->addStylesheet('plugins/GrapesJsBuilderBundle/Assets/library/css/grapes.min.css');
            $assetsEvent->addStylesheet('plugins/GrapesJsBuilderBundle/Assets/library/css/grapes-code-editor.min.css');
    }
}
