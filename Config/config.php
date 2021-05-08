<?php

declare(strict_types=1);

return [
    'name'        => 'Builder',
    'description' => 'GrapesJS Builder with MJML support for Mautic',
    'version'     => '1.0.0',
    'author'      => 'Webmecanik',
    'routes'      => [
        'main'   => [
            'grapesjsbuilder_upload' => [
                'path'       => '/grapesjsbuilder/upload',
                'controller' => 'GrapesJsBuilderBundle:FileManager:upload',
            ],
            'grapesjsbuilder_delete' => [
                'path'       => '/grapesjsbuilder/delete',
                'controller' => 'GrapesJsBuilderBundle:FileManager:delete',
            ],
            'grapesjsbuilder_builder' => [
                'path'       => '/grapesjsbuilder/{objectType}/{objectId}',
                'controller' => 'GrapesJsBuilderBundle:GrapesJs:builder',
            ],
        ],
        'public' => [],
        'api'    => [],
    ],
    'menu'        => [],
    'services'    => [
        'other'        => [
            'grapesjsbuilder.helper.config' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\Helper\GrapesJsConfig::class,
                'arguments' => [
                    'mautic.integrations.helper.builder_integrations',
                ],
            ],
        ],
        'sync'         => [],
        'integrations' => [
        ],
        'models'  => [
            'grapesjsbuilder.model' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\Model\GrapesJsBuilderModel::class,
                'arguments' => [
                    'request_stack',
                    'mautic.email.model.email',
                ],
            ],
        ],
        'helpers' => [
            'grapesjsbuilder.helper.filemanager' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\Helper\FileManager::class,
                'arguments' => [
                    'mautic.helper.file_uploader',
                    'mautic.helper.core_parameters',
                    'mautic.helper.paths',
                ],
            ],
        ],
        'events'  => [
            'grapesjsbuilder.event.assets.subscriber' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\EventSubscriber\AssetsSubscriber::class,
                'arguments' => [
                    'mautic.install.service',
                ],
            ],
            'grapesjsbuilder.event.email.subscriber' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\EventSubscriber\EmailSubscriber::class,
                'arguments' => [
                    'grapesjsbuilder.model',
                ],
            ],
            'grapesjsbuilder.event.content.subscriber' => [
                'class'     => \MauticPlugin\GrapesJsBuilderBundle\EventSubscriber\InjectCustomContentSubscriber::class,
                'arguments' => [
                    'grapesjsbuilder.model',
                    'grapesjsbuilder.helper.filemanager',
                    'mautic.helper.templating',
                    'request_stack',
                    'router',
                ],
            ],
        ],
    ],
    'parameters' => [
        'image_path_exclude'     => ['flags', 'mejs'], // exclude certain folders from showing in the image browser
        'static_url'             => '', // optional base url for images
    ],
];
